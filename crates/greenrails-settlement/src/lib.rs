//! GREENRAILS settlement core — MOCK ONLY.
//!
//! `MOCK SETTLEMENT · NO FUNDS WILL MOVE`
//!
//! Pure, no-network evaluator for the canonical settlement state machine:
//! supported fiat/crypto input -> exact-output $XENTS -> Legacy NFT transfer on
//! its native chain -> reserved USDC (Base) released to the seller.
//!
//! Nothing here executes swaps, transfers, payouts or wallet signatures.
//! Providers only record intents. Receipts are signed with a public dev key;
//! production keys live in a sealed signer, never in this crate.

#![forbid(unsafe_code)]

pub mod confirmation;
pub mod ledger;
pub mod providers;
pub mod quote;
pub mod receipt;
pub mod settlement;
pub mod state;

pub use confirmation::{ConfirmationPolicy, ConfirmationStatus};
pub use ledger::{BuyerInput, LedgerError, UsdcReserve};
pub use providers::{
    InputRail, Intent, IntentKind, MockInputRail, MockNftTransfer, MockProviders, MockUsdcPayout,
    MockXentsRouter, NftTransfer, UsdcPayout, XentsRouter, MOCK_BANNER,
};
pub use quote::{InputAsset, LiquidityPolicy, LiquidityWindow, Quote, QuoteError};
pub use receipt::{
    canonical_json, sign, sign_dev, verify, verify_dev, Receipt, ReceiptError, SignedReceipt,
    DEV_RECEIPT_KEY, DEV_RECEIPT_KEY_ID,
};
pub use settlement::{Applied, LogEntry, NftRef, Settlement, SettlementError};
pub use state::{allowed_events, transition, InvalidTransition, SettlementEvent, SettlementState};

/// Any live-funds switch must default to false and is only flipped by explicit
/// human approval after security, legal/compliance, custody/liquidity and
/// rollback gates. This crate has no code path that reads it as true.
pub const LIVE_FUNDS_ENABLED: bool = false;
