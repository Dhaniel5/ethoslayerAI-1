//! EthosLayer escrow program.
//!
//! Funds are held in a token account whose authority is a program-derived
//! address (PDA) unique to each escrow. Only this program, enforcing the
//! rules below, can move them — no human or server key can.
//!
//! ## Authority model (read this before changing anything)
//!
//! * `payer`    funds the escrow; approves milestones / releases to the
//!              receiver; may refund to themselves ONLY after `expiry`
//!              and ONLY if no dispute is open.
//! * `receiver` is paid; may voluntarily refund the payer at any time while
//!              the escrow is `Locked`.
//! * `arbiter`  has exactly one power: resolving an OPEN dispute, splitting
//!              the remaining balance between receiver and payer. The arbiter
//!              cannot release or refund an undisputed escrow, and must be a
//!              different key from both payer and receiver.
//! * Either `payer` or `receiver` can open a dispute. Once `Disputed`, the
//!   ordinary release / refund paths are closed until the arbiter resolves it.
//!   Deadlines never auto-release disputed funds.
//!
//! The arbiter is chosen by the payer at creation. That is a deliberate v1
//! simplification with a real trust cost (the receiver must trust that
//! choice); see README for stronger alternatives.
//!
//! ## States
//!
//!   Locked ──► Released   (everything paid to receiver)
//!   Locked ──► Refunded   (everything returned to payer)
//!   Locked ──► Disputed ──► Released | Refunded | Resolved
//!
//! `Resolved` means a mixed outcome (some paid out, some refunded). The final
//! state is always derived from what was actually transferred.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

// Placeholder. Replaced by `anchor keys sync` after the first build generates
// the real program keypair (see README). It is a VALID 32-byte address so the
// crate compiles; it is NOT the deployed program ID.
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub const MAX_MILESTONES: usize = 24;
pub const ESCROW_SEED: &[u8] = b"escrow";
pub const VAULT_SEED: &[u8] = b"vault";

#[program]
pub mod ethos_escrow {
    use super::*;

    /// Creates the escrow and funds it atomically: the escrow only exists if
    /// the token transfer into the vault succeeded.
    pub fn lock_funds(
        ctx: Context<LockFunds>,
        escrow_id: [u8; 16],
        amount: u64,
        expiry: i64,
        milestone_amounts: Vec<u64>,
    ) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);
        require!(
            expiry > Clock::get()?.unix_timestamp,
            EscrowError::InvalidExpiry
        );
        require!(
            milestone_amounts.len() <= MAX_MILESTONES,
            EscrowError::TooManyMilestones
        );

        let payer = ctx.accounts.payer.key();
        let receiver = ctx.accounts.receiver.key();
        let arbiter = ctx.accounts.arbiter.key();
        require_keys_neq!(payer, receiver, EscrowError::InvalidParties);
        require_keys_neq!(arbiter, payer, EscrowError::InvalidParties);
        require_keys_neq!(arbiter, receiver, EscrowError::InvalidParties);

        if !milestone_amounts.is_empty() {
            let mut sum: u64 = 0;
            for m in milestone_amounts.iter() {
                require!(*m > 0, EscrowError::InvalidMilestoneAmount);
                sum = sum
                    .checked_add(*m)
                    .ok_or_else(|| error!(EscrowError::MathOverflow))?;
            }
            require!(sum == amount, EscrowError::MilestoneSumMismatch);
        }

        {
            let e = &mut ctx.accounts.escrow;
            e.escrow_id = escrow_id;
            e.payer = payer;
            e.receiver = receiver;
            e.arbiter = arbiter;
            e.mint = ctx.accounts.mint.key();
            e.amount = amount;
            e.released = 0;
            e.refunded = 0;
            e.expiry = expiry;
            e.state = EscrowState::Locked;
            e.bump = ctx.bumps.escrow;
            e.vault_bump = ctx.bumps.vault;
            e.milestones = milestone_amounts
                .into_iter()
                .map(|a| Milestone {
                    amount: a,
                    approved: false,
                })
                .collect();
        }

        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.payer_ata.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault_ata.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        // Defence in depth: never record an escrow as funded unless the vault
        // actually holds at least the agreed amount.
        ctx.accounts.vault_ata.reload()?;
        require!(
            ctx.accounts.vault_ata.amount >= amount,
            EscrowError::FundingShortfall
        );
        Ok(())
    }

    /// Payer approves one milestone, paying that slice to the receiver.
    pub fn approve_milestone(ctx: Context<PayReceiver>, index: u8) -> Result<()> {
        let escrow_key = ctx.accounts.escrow.key();
        let signer = ctx.accounts.signer.key();
        let (vault_bump, pay) = {
            let e = &mut ctx.accounts.escrow;
            require_keys_eq!(signer, e.payer, EscrowError::Unauthorized);
            require!(e.state == EscrowState::Locked, EscrowError::InvalidState);
            let i = index as usize;
            require!(i < e.milestones.len(), EscrowError::InvalidMilestone);
            require!(!e.milestones[i].approved, EscrowError::AlreadyApproved);

            let pay = e.milestones[i].amount;
            let new_released = e
                .released
                .checked_add(pay)
                .ok_or_else(|| error!(EscrowError::MathOverflow))?;
            let accounted = new_released
                .checked_add(e.refunded)
                .ok_or_else(|| error!(EscrowError::MathOverflow))?;
            require!(accounted <= e.amount, EscrowError::ExceedsBalance);

            e.milestones[i].approved = true;
            e.released = new_released;
            if accounted == e.amount {
                e.state = terminal_state(e.released, e.refunded);
            }
            (e.vault_bump, pay)
        };
        vault_transfer(
            &ctx.accounts.token_program,
            &ctx.accounts.vault_ata,
            &ctx.accounts.mint,
            &ctx.accounts.receiver_ata,
            &ctx.accounts.vault,
            escrow_key,
            vault_bump,
            pay,
        )
    }

    /// Payer releases the entire remaining balance to the receiver
    /// (escrows created WITHOUT milestones).
    pub fn release(ctx: Context<PayReceiver>) -> Result<()> {
        let escrow_key = ctx.accounts.escrow.key();
        let signer = ctx.accounts.signer.key();
        let (vault_bump, pay) = {
            let e = &mut ctx.accounts.escrow;
            require_keys_eq!(signer, e.payer, EscrowError::Unauthorized);
            require!(e.state == EscrowState::Locked, EscrowError::InvalidState);
            require!(e.milestones.is_empty(), EscrowError::UseMilestones);

            let pay = remaining(e)?;
            require!(pay > 0, EscrowError::NothingToSettle);
            e.released = e
                .released
                .checked_add(pay)
                .ok_or_else(|| error!(EscrowError::MathOverflow))?;
            e.state = terminal_state(e.released, e.refunded);
            (e.vault_bump, pay)
        };
        vault_transfer(
            &ctx.accounts.token_program,
            &ctx.accounts.vault_ata,
            &ctx.accounts.mint,
            &ctx.accounts.receiver_ata,
            &ctx.accounts.vault,
            escrow_key,
            vault_bump,
            pay,
        )
    }

    /// Returns the remaining balance to the payer. Allowed only while
    /// `Locked` (never during a dispute), and only when:
    ///   * the receiver signs (voluntary refund / cancellation), or
    ///   * the payer signs after `expiry` has passed.
    /// Nothing happens automatically at `expiry`: someone must send this
    /// transaction, and the on-chain clock is checked here.
    pub fn refund(ctx: Context<RefundPayer>) -> Result<()> {
        let escrow_key = ctx.accounts.escrow.key();
        let signer = ctx.accounts.signer.key();
        let now = Clock::get()?.unix_timestamp;
        let (vault_bump, back) = {
            let e = &mut ctx.accounts.escrow;
            require!(e.state == EscrowState::Locked, EscrowError::InvalidState);
            if signer == e.receiver {
                // voluntary refund: always allowed while Locked
            } else if signer == e.payer {
                require!(now > e.expiry, EscrowError::NotYetExpired);
            } else {
                return err!(EscrowError::Unauthorized);
            }

            let back = remaining(e)?;
            require!(back > 0, EscrowError::NothingToSettle);
            e.refunded = e
                .refunded
                .checked_add(back)
                .ok_or_else(|| error!(EscrowError::MathOverflow))?;
            e.state = terminal_state(e.released, e.refunded);
            (e.vault_bump, back)
        };
        vault_transfer(
            &ctx.accounts.token_program,
            &ctx.accounts.vault_ata,
            &ctx.accounts.mint,
            &ctx.accounts.payer_ata,
            &ctx.accounts.vault,
            escrow_key,
            vault_bump,
            back,
        )
    }

    /// Payer or receiver freezes the escrow pending arbitration.
    pub fn raise_dispute(ctx: Context<RaiseDispute>) -> Result<()> {
        let signer = ctx.accounts.signer.key();
        let e = &mut ctx.accounts.escrow;
        require!(e.state == EscrowState::Locked, EscrowError::InvalidState);
        require!(
            signer == e.payer || signer == e.receiver,
            EscrowError::Unauthorized
        );
        e.state = EscrowState::Disputed;
        Ok(())
    }

    /// Arbiter splits the remaining balance: `to_receiver` goes to the
    /// receiver, the rest is refunded to the payer. The final state reflects
    /// what actually moved (Released / Refunded / Resolved).
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, to_receiver: u64) -> Result<()> {
        let escrow_key = ctx.accounts.escrow.key();
        let signer = ctx.accounts.signer.key();
        let (vault_bump, to_refund) = {
            let e = &mut ctx.accounts.escrow;
            require_keys_eq!(signer, e.arbiter, EscrowError::Unauthorized);
            require!(e.state == EscrowState::Disputed, EscrowError::InvalidState);

            let rem = remaining(e)?;
            require!(rem > 0, EscrowError::NothingToSettle);
            require!(to_receiver <= rem, EscrowError::ExceedsBalance);
            let to_refund = rem
                .checked_sub(to_receiver)
                .ok_or_else(|| error!(EscrowError::MathOverflow))?;

            e.released = e
                .released
                .checked_add(to_receiver)
                .ok_or_else(|| error!(EscrowError::MathOverflow))?;
            e.refunded = e
                .refunded
                .checked_add(to_refund)
                .ok_or_else(|| error!(EscrowError::MathOverflow))?;
            e.state = terminal_state(e.released, e.refunded);
            (e.vault_bump, to_refund)
        };
        vault_transfer(
            &ctx.accounts.token_program,
            &ctx.accounts.vault_ata,
            &ctx.accounts.mint,
            &ctx.accounts.receiver_ata,
            &ctx.accounts.vault,
            escrow_key,
            vault_bump,
            to_receiver,
        )?;
        vault_transfer(
            &ctx.accounts.token_program,
            &ctx.accounts.vault_ata,
            &ctx.accounts.mint,
            &ctx.accounts.payer_ata,
            &ctx.accounts.vault,
            escrow_key,
            vault_bump,
            to_refund,
        )
    }
}

// ------------------------------------------------------------------ helpers

/// Funds still held for this escrow: amount - released - refunded.
fn remaining(e: &Escrow) -> Result<u64> {
    e.amount
        .checked_sub(e.released)
        .and_then(|v| v.checked_sub(e.refunded))
        .ok_or_else(|| error!(EscrowError::MathOverflow))
}

/// Final state derived from what was actually transferred out.
fn terminal_state(released: u64, refunded: u64) -> EscrowState {
    if refunded == 0 {
        EscrowState::Released
    } else if released == 0 {
        EscrowState::Refunded
    } else {
        EscrowState::Resolved
    }
}

#[allow(clippy::too_many_arguments)]
fn vault_transfer<'info>(
    token_program: &Program<'info, Token>,
    vault_ata: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    destination: &Account<'info, TokenAccount>,
    vault: &UncheckedAccount<'info>,
    escrow_key: Pubkey,
    vault_bump: u8,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let bump = [vault_bump];
    let seeds: &[&[u8]] = &[VAULT_SEED, escrow_key.as_ref(), &bump];
    token::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: vault_ata.to_account_info(),
                mint: mint.to_account_info(),
                to: destination.to_account_info(),
                authority: vault.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        mint.decimals,
    )
}

// ----------------------------------------------------------------- accounts

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 16])]
pub struct LockFunds<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: only its pubkey is recorded; it never signs here.
    pub receiver: UncheckedAccount<'info>,
    /// CHECK: only its pubkey is recorded; validated to differ from payer/receiver.
    pub arbiter: UncheckedAccount<'info>,
    /// Legacy SPL Token mints only (Account<Mint> enforces the Token program
    /// as owner). Token-2022 mints are rejected on purpose — see README.
    pub mint: Account<'info, Mint>,

    // Seeds include the payer so one user cannot squat another's escrow_id.
    #[account(
        init,
        payer = payer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [ESCROW_SEED, payer.key().as_ref(), escrow_id.as_ref()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    /// CHECK: PDA that is the sole authority over `vault_ata`; holds no data.
    #[account(seeds = [VAULT_SEED, escrow.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,

    #[account(mut, token::mint = mint, token::authority = payer)]
    pub payer_ata: Account<'info, TokenAccount>,

    // init_if_needed because anyone can pre-create an ATA for any address; a
    // plain `init` would let a griefer block escrow creation. The
    // associated_token constraints still force mint + authority to match.
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// approve_milestone + release: pays the receiver.
#[derive(Accounts)]
pub struct PayReceiver<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.payer.as_ref(), escrow.escrow_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(address = escrow.mint)]
    pub mint: Account<'info, Mint>,
    /// CHECK: PDA authority of vault_ata.
    #[account(seeds = [VAULT_SEED, escrow.key().as_ref()], bump = escrow.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = vault)]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = escrow.receiver)]
    pub receiver_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// refund: pays the payer.
#[derive(Accounts)]
pub struct RefundPayer<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.payer.as_ref(), escrow.escrow_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(address = escrow.mint)]
    pub mint: Account<'info, Mint>,
    /// CHECK: PDA authority of vault_ata.
    #[account(seeds = [VAULT_SEED, escrow.key().as_ref()], bump = escrow.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = vault)]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = escrow.payer)]
    pub payer_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RaiseDispute<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.payer.as_ref(), escrow.escrow_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.payer.as_ref(), escrow.escrow_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(address = escrow.mint)]
    pub mint: Account<'info, Mint>,
    /// CHECK: PDA authority of vault_ata.
    #[account(seeds = [VAULT_SEED, escrow.key().as_ref()], bump = escrow.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = vault)]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = escrow.receiver)]
    pub receiver_ata: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = escrow.payer)]
    pub payer_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// -------------------------------------------------------------------- state

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub escrow_id: [u8; 16],
    pub payer: Pubkey,
    pub receiver: Pubkey,
    pub arbiter: Pubkey,
    pub mint: Pubkey,
    /// Total deposited at creation.
    pub amount: u64,
    /// Total paid to the receiver so far.
    pub released: u64,
    /// Total returned to the payer so far.
    pub refunded: u64,
    /// Unix timestamp after which the payer may refund (if not disputed).
    pub expiry: i64,
    pub state: EscrowState,
    pub bump: u8,
    pub vault_bump: u8,
    #[max_len(24)]
    pub milestones: Vec<Milestone>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum EscrowState {
    Locked,
    Disputed,
    Released,
    Refunded,
    Resolved,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Debug)]
pub struct Milestone {
    pub amount: u64,
    pub approved: bool,
}

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Expiry must be in the future")]
    InvalidExpiry,
    #[msg("Too many milestones")]
    TooManyMilestones,
    #[msg("Milestone amounts must be greater than zero")]
    InvalidMilestoneAmount,
    #[msg("Milestone sum must equal total amount")]
    MilestoneSumMismatch,
    #[msg("Payer, receiver and arbiter must be three different accounts")]
    InvalidParties,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Vault did not receive the agreed amount")]
    FundingShortfall,
    #[msg("Invalid state for this action")]
    InvalidState,
    #[msg("Invalid milestone index")]
    InvalidMilestone,
    #[msg("Milestone already approved")]
    AlreadyApproved,
    #[msg("Signer is not authorized for this action")]
    Unauthorized,
    #[msg("Use approve_milestone for milestone-based escrows")]
    UseMilestones,
    #[msg("Amount exceeds the escrow's remaining balance")]
    ExceedsBalance,
    #[msg("Nothing left to settle")]
    NothingToSettle,
    #[msg("Escrow has not expired yet")]
    NotYetExpired,
}
