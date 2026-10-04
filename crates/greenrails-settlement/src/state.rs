//! Canonical GREENRAILS settlement states, events and the transition allow-list.

use serde::{Deserialize, Serialize};
use std::fmt;

/// The 8 success-path states followed by the 10 failure/terminal states.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SettlementState {
    Quoted,
    UsdcReserved,
    InputAuthorized,
    XentsRouted,
    NftTransferPending,
    NftTransferConfirmed,
    UsdcReleased,
    ReceiptFinalized,
    QuoteExpired,
    InputFailed,
    InsufficientLiquidity,
    NftOwnershipChanged,
    NftTransferFailed,
    ChainConfirmationTimeout,
    UsdcPayoutFailed,
    RefundPending,
    Refunded,
    ManualReview,
}

impl SettlementState {
    pub const SUCCESS_PATH: [SettlementState; 8] = [
        SettlementState::Quoted,
        SettlementState::UsdcReserved,
        SettlementState::InputAuthorized,
        SettlementState::XentsRouted,
        SettlementState::NftTransferPending,
        SettlementState::NftTransferConfirmed,
        SettlementState::UsdcReleased,
        SettlementState::ReceiptFinalized,
    ];

    pub const FAILURE_STATES: [SettlementState; 10] = [
        SettlementState::QuoteExpired,
        SettlementState::InputFailed,
        SettlementState::InsufficientLiquidity,
        SettlementState::NftOwnershipChanged,
        SettlementState::NftTransferFailed,
        SettlementState::ChainConfirmationTimeout,
        SettlementState::UsdcPayoutFailed,
        SettlementState::RefundPending,
        SettlementState::Refunded,
        SettlementState::ManualReview,
    ];

    pub const ALL: [SettlementState; 18] = [
        SettlementState::Quoted,
        SettlementState::UsdcReserved,
        SettlementState::InputAuthorized,
        SettlementState::XentsRouted,
        SettlementState::NftTransferPending,
        SettlementState::NftTransferConfirmed,
        SettlementState::UsdcReleased,
        SettlementState::ReceiptFinalized,
        SettlementState::QuoteExpired,
        SettlementState::InputFailed,
        SettlementState::InsufficientLiquidity,
        SettlementState::NftOwnershipChanged,
        SettlementState::NftTransferFailed,
        SettlementState::ChainConfirmationTimeout,
        SettlementState::UsdcPayoutFailed,
        SettlementState::RefundPending,
        SettlementState::Refunded,
        SettlementState::ManualReview,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            SettlementState::Quoted => "QUOTED",
            SettlementState::UsdcReserved => "USDC_RESERVED",
            SettlementState::InputAuthorized => "INPUT_AUTHORIZED",
            SettlementState::XentsRouted => "XENTS_ROUTED",
            SettlementState::NftTransferPending => "NFT_TRANSFER_PENDING",
            SettlementState::NftTransferConfirmed => "NFT_TRANSFER_CONFIRMED",
            SettlementState::UsdcReleased => "USDC_RELEASED",
            SettlementState::ReceiptFinalized => "RECEIPT_FINALIZED",
            SettlementState::QuoteExpired => "QUOTE_EXPIRED",
            SettlementState::InputFailed => "INPUT_FAILED",
            SettlementState::InsufficientLiquidity => "INSUFFICIENT_LIQUIDITY",
            SettlementState::NftOwnershipChanged => "NFT_OWNERSHIP_CHANGED",
            SettlementState::NftTransferFailed => "NFT_TRANSFER_FAILED",
            SettlementState::ChainConfirmationTimeout => "CHAIN_CONFIRMATION_TIMEOUT",
            SettlementState::UsdcPayoutFailed => "USDC_PAYOUT_FAILED",
            SettlementState::RefundPending => "REFUND_PENDING",
            SettlementState::Refunded => "REFUNDED",
            SettlementState::ManualReview => "MANUAL_REVIEW",
        }
    }

    pub fn is_success_path(self) -> bool {
        Self::SUCCESS_PATH.contains(&self)
    }

    pub fn is_failure(self) -> bool {
        Self::FAILURE_STATES.contains(&self)
    }

    /// Failure states that can only be entered after buyer input was
    /// authorized. They are never terminal: they must route to
    /// REFUND_PENDING -> REFUNDED or MANUAL_REVIEW.
    pub fn is_post_input_failure(self) -> bool {
        matches!(
            self,
            SettlementState::NftTransferFailed
                | SettlementState::ChainConfirmationTimeout
                | SettlementState::UsdcPayoutFailed
        )
    }

    /// States with no outgoing transitions at the pure state-machine level.
    /// INSUFFICIENT_LIQUIDITY and NFT_OWNERSHIP_CHANGED are reachable both
    /// before and after input authorization, so they keep refund exits; the
    /// `Settlement` aggregate decides whether they are terminal.
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            SettlementState::ReceiptFinalized
                | SettlementState::QuoteExpired
                | SettlementState::InputFailed
                | SettlementState::Refunded
                | SettlementState::ManualReview
        )
    }
}

impl fmt::Display for SettlementState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Domain events that drive transitions. Payload-free by design: the
/// `Settlement` aggregate carries amounts, ids and evidence.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SettlementEvent {
    UsdcReserved,
    QuoteExpired,
    LiquidityCheckFailed,
    NftOwnershipChanged,
    InputAuthorized,
    InputFailed,
    XentsRouted,
    NftTransferInitiated,
    NftTransferConfirmed,
    NftTransferFailed,
    ConfirmationTimeout,
    UsdcReleased,
    UsdcPayoutFailed,
    ReceiptFinalized,
    RefundInitiated,
    RefundCompleted,
    RefundFailed,
    EscalateManualReview,
}

impl SettlementEvent {
    pub const ALL: [SettlementEvent; 18] = [
        SettlementEvent::UsdcReserved,
        SettlementEvent::QuoteExpired,
        SettlementEvent::LiquidityCheckFailed,
        SettlementEvent::NftOwnershipChanged,
        SettlementEvent::InputAuthorized,
        SettlementEvent::InputFailed,
        SettlementEvent::XentsRouted,
        SettlementEvent::NftTransferInitiated,
        SettlementEvent::NftTransferConfirmed,
        SettlementEvent::NftTransferFailed,
        SettlementEvent::ConfirmationTimeout,
        SettlementEvent::UsdcReleased,
        SettlementEvent::UsdcPayoutFailed,
        SettlementEvent::ReceiptFinalized,
        SettlementEvent::RefundInitiated,
        SettlementEvent::RefundCompleted,
        SettlementEvent::RefundFailed,
        SettlementEvent::EscalateManualReview,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct InvalidTransition {
    pub from: SettlementState,
    pub event: SettlementEvent,
}

impl fmt::Display for InvalidTransition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid transition: {} on {:?}", self.from, self.event)
    }
}

impl std::error::Error for InvalidTransition {}

/// Explicit allow-list. Anything not listed is rejected.
pub fn transition(
    state: SettlementState,
    event: SettlementEvent,
) -> Result<SettlementState, InvalidTransition> {
    use SettlementEvent as E;
    use SettlementState as S;
    let next = match (state, event) {
        // Success path
        (S::Quoted, E::UsdcReserved) => S::UsdcReserved,
        (S::UsdcReserved, E::InputAuthorized) => S::InputAuthorized,
        (S::InputAuthorized, E::XentsRouted) => S::XentsRouted,
        (S::XentsRouted, E::NftTransferInitiated) => S::NftTransferPending,
        (S::NftTransferPending, E::NftTransferConfirmed) => S::NftTransferConfirmed,
        (S::NftTransferConfirmed, E::UsdcReleased) => S::UsdcReleased,
        (S::UsdcReleased, E::ReceiptFinalized) => S::ReceiptFinalized,

        // Pre-input failures (no buyer funds accepted; reserve is freed)
        (S::Quoted | S::UsdcReserved, E::QuoteExpired) => S::QuoteExpired,
        (S::UsdcReserved, E::InputFailed) => S::InputFailed,
        (S::Quoted | S::UsdcReserved, E::LiquidityCheckFailed) => S::InsufficientLiquidity,
        (S::Quoted | S::UsdcReserved, E::NftOwnershipChanged) => S::NftOwnershipChanged,

        // Post-input failures (buyer funds accepted; must compensate)
        (S::InputAuthorized, E::LiquidityCheckFailed) => S::InsufficientLiquidity,
        (S::InputAuthorized | S::XentsRouted, E::NftOwnershipChanged) => S::NftOwnershipChanged,
        (S::NftTransferPending, E::NftTransferFailed) => S::NftTransferFailed,
        (S::NftTransferPending, E::ConfirmationTimeout) => S::ChainConfirmationTimeout,
        (S::NftTransferConfirmed, E::UsdcPayoutFailed) => S::UsdcPayoutFailed,

        // Compensation routing
        (
            S::InsufficientLiquidity
            | S::NftOwnershipChanged
            | S::NftTransferFailed
            | S::ChainConfirmationTimeout,
            E::RefundInitiated,
        ) => S::RefundPending,
        (
            S::InsufficientLiquidity
            | S::NftOwnershipChanged
            | S::NftTransferFailed
            | S::ChainConfirmationTimeout
            | S::UsdcPayoutFailed,
            E::EscalateManualReview,
        ) => S::ManualReview,
        (S::RefundPending, E::RefundCompleted) => S::Refunded,
        (S::RefundPending, E::RefundFailed) => S::ManualReview,

        _ => return Err(InvalidTransition { from: state, event }),
    };
    Ok(next)
}

/// All events accepted from `state`, in declaration order.
pub fn allowed_events(state: SettlementState) -> Vec<SettlementEvent> {
    SettlementEvent::ALL
        .iter()
        .copied()
        .filter(|e| transition(state, *e).is_ok())
        .collect()
}
