// EthosLayer Escrow Program
// ---------------------------------------------------------------
// On-chain enforcement of AUDD escrow with milestones, release,
// and dispute. The vault is a PDA — no human or server holds the key.
//
// State machine:
//   Created -> Locked (on lock_funds)
//   Locked  -> Released  (on release / approve last milestone)
//   Locked  -> Disputed  (on raise_dispute)
//   Disputed-> Released | Refunded (on resolve_dispute by arbiter)
//
// Authority model:
//   payer    : funds the escrow, can raise dispute
//   receiver : receives funds on release
//   arbiter  : optional; resolves disputes (e.g. EthosLayer DAO key)

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("EthosEscrow1111111111111111111111111111111");

#[program]
pub mod ethos_escrow {
    use super::*;

    /// Create the escrow account and lock `amount` AUDD from payer -> vault PDA.
    pub fn lock_funds(
        ctx: Context<LockFunds>,
        escrow_id: [u8; 16],
        amount: u64,
        milestone_amounts: Vec<u64>,
    ) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);
        let sum: u64 = milestone_amounts.iter().sum();
        if !milestone_amounts.is_empty() {
            require!(sum == amount, EscrowError::MilestoneSumMismatch);
        }

        let e = &mut ctx.accounts.escrow;
        e.escrow_id = escrow_id;
        e.payer = ctx.accounts.payer.key();
        e.receiver = ctx.accounts.receiver.key();
        e.arbiter = ctx.accounts.arbiter.key();
        e.mint = ctx.accounts.mint.key();
        e.amount = amount;
        e.released = 0;
        e.state = EscrowState::Locked;
        e.milestones = milestone_amounts
            .into_iter()
            .map(|amt| Milestone { amount: amt, approved: false })
            .collect();
        e.bump = ctx.bumps.escrow;
        e.vault_bump = ctx.bumps.vault;

        // Transfer payer ATA -> vault ATA.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer_ata.to_account_info(),
                    to: ctx.accounts.vault_ata.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            amount,
        )?;

        Ok(())
    }

    /// Approve a milestone and release that slice to the receiver.
    /// Signed by payer (or arbiter for forced release).
    pub fn approve_milestone(ctx: Context<ReleaseFunds>, index: u8) -> Result<()> {
        let e = &mut ctx.accounts.escrow;
        require!(e.state == EscrowState::Locked, EscrowError::InvalidState);
        let i = index as usize;
        require!(i < e.milestones.len(), EscrowError::InvalidMilestone);
        require!(!e.milestones[i].approved, EscrowError::AlreadyApproved);
        require!(
            ctx.accounts.signer.key() == e.payer || ctx.accounts.signer.key() == e.arbiter,
            EscrowError::Unauthorized
        );

        let amount = e.milestones[i].amount;
        e.milestones[i].approved = true;
        e.released = e.released.checked_add(amount).unwrap();

        transfer_from_vault(&ctx, amount)?;

        if e.released >= e.amount {
            e.state = EscrowState::Released;
        }
        Ok(())
    }

    /// Release all remaining funds (single-approval escrows).
    pub fn release(ctx: Context<ReleaseFunds>) -> Result<()> {
        let e = &mut ctx.accounts.escrow;
        require!(e.state == EscrowState::Locked, EscrowError::InvalidState);
        require!(e.milestones.is_empty(), EscrowError::UseMilestones);
        require!(
            ctx.accounts.signer.key() == e.payer || ctx.accounts.signer.key() == e.arbiter,
            EscrowError::Unauthorized
        );

        let remaining = e.amount.checked_sub(e.released).unwrap();
        transfer_from_vault(&ctx, remaining)?;
        e.released = e.amount;
        e.state = EscrowState::Released;
        Ok(())
    }

    /// Raise a dispute; payer or receiver may call.
    pub fn raise_dispute(ctx: Context<MutateState>) -> Result<()> {
        let e = &mut ctx.accounts.escrow;
        require!(e.state == EscrowState::Locked, EscrowError::InvalidState);
        require!(
            ctx.accounts.signer.key() == e.payer || ctx.accounts.signer.key() == e.receiver,
            EscrowError::Unauthorized
        );
        e.state = EscrowState::Disputed;
        Ok(())
    }

    /// Arbiter resolves: `to_receiver` of the remaining funds, refund the rest.
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, to_receiver: u64) -> Result<()> {
        let e = &mut ctx.accounts.escrow;
        require!(e.state == EscrowState::Disputed, EscrowError::InvalidState);
        require!(ctx.accounts.signer.key() == e.arbiter, EscrowError::Unauthorized);

        let remaining = e.amount.checked_sub(e.released).unwrap();
        require!(to_receiver <= remaining, EscrowError::InvalidAmount);
        let to_refund = remaining - to_receiver;

        if to_receiver > 0 {
            transfer_vault_to(
                &ctx.accounts.vault_ata,
                &ctx.accounts.receiver_ata,
                &ctx.accounts.vault,
                &ctx.accounts.token_program,
                e,
                to_receiver,
            )?;
        }
        if to_refund > 0 {
            transfer_vault_to(
                &ctx.accounts.vault_ata,
                &ctx.accounts.payer_ata,
                &ctx.accounts.vault,
                &ctx.accounts.token_program,
                e,
                to_refund,
            )?;
        }
        e.released = e.amount;
        e.state = EscrowState::Released;
        Ok(())
    }
}

// -------- helpers --------

fn transfer_from_vault(ctx: &Context<ReleaseFunds>, amount: u64) -> Result<()> {
    let e = &ctx.accounts.escrow;
    transfer_vault_to(
        &ctx.accounts.vault_ata,
        &ctx.accounts.receiver_ata,
        &ctx.accounts.vault,
        &ctx.accounts.token_program,
        e,
        amount,
    )
}

fn transfer_vault_to<'info>(
    vault_ata: &Account<'info, TokenAccount>,
    dest_ata: &Account<'info, TokenAccount>,
    vault: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    escrow: &Account<'info, Escrow>,
    amount: u64,
) -> Result<()> {
    let escrow_key = escrow.key();
    let seeds = &[b"vault", escrow_key.as_ref(), &[escrow.vault_bump]];
    let signer = &[&seeds[..]];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer {
                from: vault_ata.to_account_info(),
                to: dest_ata.to_account_info(),
                authority: vault.clone(),
            },
            signer,
        ),
        amount,
    )
}

// -------- accounts --------

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 16])]
pub struct LockFunds<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: receiver pubkey only; ATA is derived elsewhere.
    pub receiver: UncheckedAccount<'info>,
    /// CHECK: arbiter pubkey only; can equal payer if no arbitration desired.
    pub arbiter: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = Escrow::SPACE,
        seeds = [b"escrow", escrow_id.as_ref()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    /// CHECK: PDA, owns vault_ata.
    #[account(seeds = [b"vault", escrow.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = payer)]
    pub payer_ata: Account<'info, TokenAccount>,
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
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ReleaseFunds<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(mut)]
    pub escrow: Account<'info, Escrow>,
    /// CHECK: PDA authority of vault_ata.
    #[account(seeds = [b"vault", escrow.key().as_ref()], bump = escrow.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    #[account(mut)] pub vault_ata: Account<'info, TokenAccount>,
    #[account(mut)] pub receiver_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MutateState<'info> {
    pub signer: Signer<'info>,
    #[account(mut)]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    pub signer: Signer<'info>,
    #[account(mut)]
    pub escrow: Account<'info, Escrow>,
    /// CHECK: PDA
    #[account(seeds = [b"vault", escrow.key().as_ref()], bump = escrow.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    #[account(mut)] pub vault_ata: Account<'info, TokenAccount>,
    #[account(mut)] pub receiver_ata: Account<'info, TokenAccount>,
    #[account(mut)] pub payer_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// -------- state --------

#[account]
pub struct Escrow {
    pub escrow_id: [u8; 16],
    pub payer: Pubkey,
    pub receiver: Pubkey,
    pub arbiter: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub released: u64,
    pub state: EscrowState,
    pub milestones: Vec<Milestone>,
    pub bump: u8,
    pub vault_bump: u8,
}

impl Escrow {
    // 8 disc + 16 id + 32*4 keys + 8*2 + 1 state + 4 vec len + 24 milestones*9 + 2 bumps
    pub const SPACE: usize = 8 + 16 + 32 * 4 + 8 * 2 + 1 + 4 + 24 * 9 + 2;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowState { Created, Locked, Released, Disputed, Refunded }

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Milestone { pub amount: u64, pub approved: bool }

#[error_code]
pub enum EscrowError {
    #[msg("Invalid amount")] InvalidAmount,
    #[msg("Milestone sum must equal total amount")] MilestoneSumMismatch,
    #[msg("Invalid state for this action")] InvalidState,
    #[msg("Invalid milestone index")] InvalidMilestone,
    #[msg("Milestone already approved")] AlreadyApproved,
    #[msg("Unauthorized signer")] Unauthorized,
    #[msg("Use approve_milestone for milestone-based escrows")] UseMilestones,
}
