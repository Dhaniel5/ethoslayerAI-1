use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

// Placeholder — replaced automatically by `anchor keys sync` the first time
// this is built locally against a real generated program keypair.
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod ethoslayer_escrow {
    use super::*;

    /// One-time setup. Creates the singleton Config account that names the
    /// arbiter authority — in production this is EthosLayer's own backend
    /// signer, the same authority that runs the AI-scored dispute process,
    /// so a dispute resolved off-chain can actually be enacted on-chain.
    pub fn initialize_config(ctx: Context<InitializeConfig>, arbiter: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.arbiter = arbiter;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// Lets the admin rotate the arbiter key without redeploying.
    pub fn update_arbiter(ctx: Context<UpdateArbiter>, new_arbiter: Pubkey) -> Result<()> {
        ctx.accounts.config.arbiter = new_arbiter;
        Ok(())
    }

    /// Buyer creates and funds an escrow in one step: deposits `amount` of
    /// `mint` tokens into a vault owned by this escrow's own PDA, so neither
    /// EthosLayer nor any backend wallet ever custodies the funds directly —
    /// only this program, under these rules, can move them.
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        nonce: u64,
        amount: u64,
        expiry: i64,
    ) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);
        require!(
            expiry > Clock::get()?.unix_timestamp,
            EscrowError::InvalidExpiry
        );
        require_keys_neq!(
            ctx.accounts.buyer.key(),
            ctx.accounts.seller.key(),
            EscrowError::BuyerEqualsSeller
        );

        let escrow = &mut ctx.accounts.escrow;
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.seller = ctx.accounts.seller.key();
        escrow.mint = ctx.accounts.mint.key();
        escrow.vault = ctx.accounts.vault.key();
        escrow.amount = amount;
        escrow.nonce = nonce;
        escrow.expiry = expiry;
        escrow.status = EscrowStatus::Funded;
        escrow.bump = ctx.bumps.escrow;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(EscrowFunded {
            escrow: escrow.key(),
            buyer: escrow.buyer,
            seller: escrow.seller,
            amount,
            nonce,
        });
        Ok(())
    }

    /// Either party can flag a disagreement. Once disputed, only the arbiter
    /// can release or refund — neither party can act unilaterally anymore,
    /// which is the entire point of having an arbiter at all.
    pub fn raise_dispute(ctx: Context<RaiseDispute>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Funded,
            EscrowError::WrongStatus
        );
        require!(
            ctx.accounts.signer.key() == escrow.buyer || ctx.accounts.signer.key() == escrow.seller,
            EscrowError::Unauthorized
        );
        escrow.status = EscrowStatus::Disputed;
        emit!(EscrowDisputed {
            escrow: escrow.key(),
            raised_by: ctx.accounts.signer.key(),
        });
        Ok(())
    }

    /// Pays the seller. Callable by the buyer (voluntary confirmation, only
    /// while not disputed) or by the arbiter (resolving a dispute, or acting
    /// on a confirmation flow driven by the app's own dispute logic).
    pub fn release(ctx: Context<Resolve>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        let signer = ctx.accounts.signer.key();

        let is_buyer = signer == escrow.buyer;
        let is_arbiter = signer == ctx.accounts.config.arbiter;
        require!(is_buyer || is_arbiter, EscrowError::Unauthorized);
        if is_buyer {
            require!(
                escrow.status == EscrowStatus::Funded,
                EscrowError::WrongStatus
            );
        } else {
            require!(
                escrow.status == EscrowStatus::Funded || escrow.status == EscrowStatus::Disputed,
                EscrowError::WrongStatus
            );
        }

        require_keys_eq!(
            ctx.accounts.destination_token_account.owner,
            escrow.seller,
            EscrowError::WrongDestination
        );
        transfer_out_and_close(&ctx, ctx.accounts.destination_token_account.to_account_info())?;
        ctx.accounts.escrow.status = EscrowStatus::Released;
        emit!(EscrowReleased {
            escrow: ctx.accounts.escrow.key(),
            to: ctx.accounts.destination_token_account.owner,
        });
        Ok(())
    }

    /// Returns funds to the buyer. Callable by the seller (voluntary
    /// refund), the arbiter (resolving a dispute in the buyer's favor), or
    /// by the buyer themself once `expiry` has passed with no dispute ever
    /// raised — the "the seller never delivered and nobody objected" path.
    pub fn refund(ctx: Context<Resolve>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        let signer = ctx.accounts.signer.key();

        let is_seller = signer == escrow.seller;
        let is_arbiter = signer == ctx.accounts.config.arbiter;
        let is_expired_buyer_claim = signer == escrow.buyer
            && escrow.status == EscrowStatus::Funded
            && Clock::get()?.unix_timestamp > escrow.expiry;

        require!(
            is_seller || is_arbiter || is_expired_buyer_claim,
            EscrowError::Unauthorized
        );
        if is_seller {
            require!(
                escrow.status == EscrowStatus::Funded || escrow.status == EscrowStatus::Disputed,
                EscrowError::WrongStatus
            );
        } else if is_arbiter {
            require!(
                escrow.status == EscrowStatus::Funded || escrow.status == EscrowStatus::Disputed,
                EscrowError::WrongStatus
            );
        }

        require_keys_eq!(
            ctx.accounts.destination_token_account.owner,
            escrow.buyer,
            EscrowError::WrongDestination
        );
        transfer_out_and_close(&ctx, ctx.accounts.destination_token_account.to_account_info())?;
        ctx.accounts.escrow.status = EscrowStatus::Refunded;
        emit!(EscrowRefunded {
            escrow: ctx.accounts.escrow.key(),
            to: ctx.accounts.destination_token_account.owner,
        });
        Ok(())
    }
}

/// Shared vault -> destination transfer + vault close, used by both
/// `release` and `refund` (same shape, different destination/status).
fn transfer_out_and_close(ctx: &Context<Resolve>, destination: AccountInfo) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    let seeds = &[
        b"escrow",
        escrow.buyer.as_ref(),
        escrow.seller.as_ref(),
        &escrow.nonce.to_le_bytes(),
        &[escrow.bump],
    ];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: destination,
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer_seeds,
        ),
        ctx.accounts.vault.amount,
    )?;

    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.buyer.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        },
        signer_seeds,
    ))?;
    Ok(())
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub arbiter: Pubkey,
    pub bump: u8,
}
impl Config {
    pub const SPACE: usize = 8 + 32 + 32 + 1;
}

#[account]
pub struct Escrow {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub nonce: u64,
    pub expiry: i64,
    pub status: EscrowStatus,
    pub bump: u8,
}
impl Escrow {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EscrowStatus {
    Funded,
    Disputed,
    Released,
    Refunded,
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = Config::SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateArbiter<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = admin @ EscrowError::Unauthorized
    )]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct InitializeEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: only used as a pubkey reference for seed derivation and the
    /// escrow record — the seller doesn't need to sign to be paid into.
    pub seller: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = buyer,
        space = Escrow::SPACE,
        seeds = [b"escrow", buyer.key().as_ref(), seller.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        init,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = escrow
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key(),
        constraint = buyer_token_account.mint == mint.key()
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RaiseDispute<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", escrow.buyer.as_ref(), escrow.seller.as_ref(), &escrow.nonce.to_le_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,
}

/// Shared account set for `release` and `refund` — both move the full vault
/// balance to a destination and close the vault, so they need the same
/// accounts; only who may sign and the destination's expected owner differ,
/// which the handler logic (not the account validation) enforces.
#[derive(Accounts)]
pub struct Resolve<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    /// CHECK: only receives back the vault's rent lamports on close; always
    /// the original buyer regardless of whether this call is a release or a
    /// refund, since the buyer paid that rent when the escrow was created.
    #[account(mut, address = escrow.buyer)]
    pub buyer: UncheckedAccount<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    // Deliberately not closed on release/refund: EthosLayer's trust scoring
    // reads back completed escrow outcomes, so the record (final status,
    // amount, parties) needs to persist on-chain rather than be reclaimed
    // for rent. Only the vault (the token holding account) closes below.
    #[account(
        mut,
        seeds = [b"escrow", escrow.buyer.as_ref(), escrow.seller.as_ref(), &escrow.nonce.to_le_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut, address = escrow.vault)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut, constraint = destination_token_account.mint == escrow.mint)]
    pub destination_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[event]
pub struct EscrowFunded {
    pub escrow: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub nonce: u64,
}

#[event]
pub struct EscrowDisputed {
    pub escrow: Pubkey,
    pub raised_by: Pubkey,
}

#[event]
pub struct EscrowReleased {
    pub escrow: Pubkey,
    pub to: Pubkey,
}

#[event]
pub struct EscrowRefunded {
    pub escrow: Pubkey,
    pub to: Pubkey,
}

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Expiry must be in the future")]
    InvalidExpiry,
    #[msg("Buyer and seller must be different accounts")]
    BuyerEqualsSeller,
    #[msg("Escrow is not in the required status for this action")]
    WrongStatus,
    #[msg("Signer is not authorized to perform this action")]
    Unauthorized,
    #[msg("Destination token account does not belong to the expected party")]
    WrongDestination,
}
