//! The `Settlement` aggregate: one quote, one NFT, one seller USDC reserve.
//! Enforces the invariants on top of the pure transition allow-list.

use crate::confirmation::{ConfirmationPolicy, ConfirmationStatus};
use crate::ledger::{BuyerInput, LedgerError, UsdcReserve};
use crate::providers::{InputRail, Intent, NftTransfer, UsdcPayout, XentsRouter, MOCK_BANNER};
use crate::quote::{LiquidityWindow, Quote, QuoteError};
use crate::receipt::Receipt;
use crate::state::{transition, InvalidTransition, SettlementEvent, SettlementState};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NftRef {
    pub chain: String,
    pub token_ref: String,
    pub seller: String,
    pub buyer: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SettlementError {
    Invalid(InvalidTransition),
    Ledger(LedgerError),
    Quote(QuoteError),
    /// Same event id replayed with a different event/payload.
    ConflictingDuplicate {
        event_id: String,
        recorded: String,
        attempted: String,
    },
    /// Buyer input may only be accepted while seller USDC is fully reserved.
    ReserveNotHeld,
    /// RECEIPT_FINALIZED requires both legs verified.
    LegsNotVerified {
        nft_transfer_confirmed: bool,
        usdc_released: bool,
    },
    NothingToRefund,
    TransferNotStarted,
}

impl fmt::Display for SettlementError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}

impl std::error::Error for SettlementError {}

impl From<InvalidTransition> for SettlementError {
    fn from(e: InvalidTransition) -> Self {
        SettlementError::Invalid(e)
    }
}
impl From<LedgerError> for SettlementError {
    fn from(e: LedgerError) -> Self {
        SettlementError::Ledger(e)
    }
}
impl From<QuoteError> for SettlementError {
    fn from(e: QuoteError) -> Self {
        SettlementError::Quote(e)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Applied {
    Transitioned {
        from: SettlementState,
        to: SettlementState,
    },
    /// Same event id and same event seen before: no-op.
    Replayed,
    /// Event recorded but state unchanged (e.g. confirmations still pending).
    Unchanged,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LogEntry {
    pub event_id: String,
    pub event: SettlementEvent,
    pub from: SettlementState,
    pub to: SettlementState,
    pub at: u64,
    pub note: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Settlement {
    pub banner: String,
    pub settlement_id: String,
    pub quote: Quote,
    pub nft: NftRef,
    pub state: SettlementState,
    pub history: Vec<SettlementState>,
    pub usdc_reserve: UsdcReserve,
    pub buyer_input: BuyerInput,
    pub buyer_input_accepted: bool,
    pub nft_transfer_confirmed: bool,
    pub usdc_released: bool,
    pub transfer_started_at: Option<u64>,
    pub intents: Vec<Intent>,
    pub log: Vec<LogEntry>,
    applied: BTreeMap<String, String>,
}

fn fingerprint(event: SettlementEvent, payload: &str) -> String {
    format!("{event:?}:{payload}")
}

impl Settlement {
    pub fn new(
        settlement_id: impl Into<String>,
        quote: Quote,
        nft: NftRef,
    ) -> Result<Self, SettlementError> {
        quote.validate()?;
        Ok(Self {
            banner: MOCK_BANNER.to_string(),
            settlement_id: settlement_id.into(),
            quote,
            nft,
            state: SettlementState::Quoted,
            history: vec![SettlementState::Quoted],
            usdc_reserve: UsdcReserve::default(),
            buyer_input: BuyerInput::default(),
            buyer_input_accepted: false,
            nft_transfer_confirmed: false,
            usdc_released: false,
            transfer_started_at: None,
            intents: Vec::new(),
            log: Vec::new(),
            applied: BTreeMap::new(),
        })
    }

    /// Terminal at aggregate level: pure-terminal states, or a pre-input
    /// failure where no buyer funds were accepted (nothing to compensate).
    pub fn is_terminal(&self) -> bool {
        if self.state.is_terminal() {
            return true;
        }
        matches!(
            self.state,
            SettlementState::InsufficientLiquidity | SettlementState::NftOwnershipChanged
        ) && !self.buyer_input_accepted
    }

    /// Buyer funds accepted and neither delivered nor refunded nor escalated.
    pub fn has_open_obligation(&self) -> bool {
        self.buyer_input_accepted
            && self.state != SettlementState::ReceiptFinalized
            && self.state != SettlementState::Refunded
            && self.state != SettlementState::ManualReview
    }

    fn idempotency(
        &self,
        event_id: &str,
        event: SettlementEvent,
        payload: &str,
    ) -> Result<Option<Applied>, SettlementError> {
        let fp = fingerprint(event, payload);
        match self.applied.get(event_id) {
            None => Ok(None),
            Some(recorded) if *recorded == fp => Ok(Some(Applied::Replayed)),
            Some(recorded) => Err(SettlementError::ConflictingDuplicate {
                event_id: event_id.to_string(),
                recorded: recorded.clone(),
                attempted: fp,
            }),
        }
    }

    /// Validate the transition without mutating.
    fn peek(&self, event: SettlementEvent) -> Result<SettlementState, SettlementError> {
        Ok(transition(self.state, event)?)
    }

    fn commit(
        &mut self,
        event_id: &str,
        event: SettlementEvent,
        payload: &str,
        now: u64,
        note: impl Into<String>,
    ) -> Result<Applied, SettlementError> {
        let from = self.state;
        let to = transition(from, event)?;
        self.state = to;
        self.history.push(to);
        self.applied
            .insert(event_id.to_string(), fingerprint(event, payload));
        self.log.push(LogEntry {
            event_id: event_id.to_string(),
            event,
            from,
            to,
            at: now,
            note: note.into(),
        });
        if to.is_failure() && !self.nft_transfer_confirmed && self.usdc_reserve.outstanding() > 0 {
            let freed = self.usdc_reserve.free_all()?;
            if let Some(last) = self.log.last_mut() {
                last.note
                    .push_str(&format!("; freed {freed} USDC minor from reserve"));
            }
        }
        self.usdc_reserve.check()?;
        Ok(Applied::Transitioned { from, to })
    }

    fn record_unchanged(
        &mut self,
        event_id: &str,
        event: SettlementEvent,
        payload: &str,
        now: u64,
        note: impl Into<String>,
    ) -> Applied {
        self.applied
            .insert(event_id.to_string(), fingerprint(event, payload));
        self.log.push(LogEntry {
            event_id: event_id.to_string(),
            event,
            from: self.state,
            to: self.state,
            at: now,
            note: note.into(),
        });
        Applied::Unchanged
    }

    /// Expire the quote if `now` is past `expires_at` and no input accepted.
    pub fn tick(&mut self, event_id: &str, now: u64) -> Result<Applied, SettlementError> {
        let payload = now.to_string();
        if let Some(r) = self.idempotency(event_id, SettlementEvent::QuoteExpired, &payload)? {
            return Ok(r);
        }
        if !self.quote.is_expired(now) {
            return Ok(Applied::Unchanged);
        }
        self.peek(SettlementEvent::QuoteExpired)?;
        self.commit(
            event_id,
            SettlementEvent::QuoteExpired,
            &payload,
            now,
            "quote expired before input authorization",
        )
    }

    /// Reserve the seller's USDC payout. Checks expiry and liquidity caps
    /// (without consuming window liquidity).
    pub fn reserve_usdc(
        &mut self,
        event_id: &str,
        liquidity: &mut LiquidityWindow,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        let payload = self.quote.seller_usdc_minor.to_string();
        if let Some(r) = self.idempotency(event_id, SettlementEvent::UsdcReserved, &payload)? {
            return Ok(r);
        }
        if self.quote.is_expired(now) {
            self.peek(SettlementEvent::QuoteExpired)?;
            return self.commit(
                event_id,
                SettlementEvent::QuoteExpired,
                &payload,
                now,
                "quote expired at reservation",
            );
        }
        if let Err(e) = liquidity.check(self.quote.xents_out, now) {
            self.peek(SettlementEvent::LiquidityCheckFailed)?;
            return self.commit(
                event_id,
                SettlementEvent::LiquidityCheckFailed,
                &payload,
                now,
                format!("liquidity cap: {e}"),
            );
        }
        self.peek(SettlementEvent::UsdcReserved)?;
        self.usdc_reserve.reserve(self.quote.seller_usdc_minor)?;
        self.commit(
            event_id,
            SettlementEvent::UsdcReserved,
            &payload,
            now,
            "seller USDC (Base) reserved",
        )
    }

    /// Accept buyer input. Rejected unless seller USDC is fully reserved.
    pub fn authorize_input<R: InputRail>(
        &mut self,
        event_id: &str,
        rail: &mut R,
        amount_minor: u64,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        let payload = amount_minor.to_string();
        if let Some(r) = self.idempotency(event_id, SettlementEvent::InputAuthorized, &payload)? {
            return Ok(r);
        }
        if self.quote.is_expired(now) {
            self.peek(SettlementEvent::QuoteExpired)?;
            return self.commit(
                event_id,
                SettlementEvent::QuoteExpired,
                &payload,
                now,
                "quote expired at input authorization",
            );
        }
        self.peek(SettlementEvent::InputAuthorized)?;
        if !self.usdc_reserve.is_fully_reserved() {
            return Err(SettlementError::ReserveNotHeld);
        }
        if amount_minor > self.quote.max_input_minor {
            self.peek(SettlementEvent::InputFailed)?;
            return self.commit(
                event_id,
                SettlementEvent::InputFailed,
                &payload,
                now,
                "input exceeds quote max_input_minor",
            );
        }
        let intent = rail.authorize(&self.settlement_id, self.quote.input_asset, amount_minor);
        self.buyer_input.authorize(amount_minor)?;
        self.buyer_input_accepted = true;
        self.intents.push(intent);
        self.commit(
            event_id,
            SettlementEvent::InputAuthorized,
            &payload,
            now,
            "buyer input authorized (intent recorded)",
        )
    }

    pub fn fail_input(
        &mut self,
        event_id: &str,
        reason: &str,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        if let Some(r) = self.idempotency(event_id, SettlementEvent::InputFailed, reason)? {
            return Ok(r);
        }
        self.peek(SettlementEvent::InputFailed)?;
        self.commit(event_id, SettlementEvent::InputFailed, reason, now, reason)
    }

    /// Route input to exact-output $XENTS. Slippage / max-input / liquidity
    /// breaches land in INSUFFICIENT_LIQUIDITY.
    pub fn route_xents<X: XentsRouter>(
        &mut self,
        event_id: &str,
        router: &mut X,
        liquidity: &mut LiquidityWindow,
        executed_input_minor: u64,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        let payload = executed_input_minor.to_string();
        if let Some(r) = self.idempotency(event_id, SettlementEvent::XentsRouted, &payload)? {
            return Ok(r);
        }
        self.peek(SettlementEvent::XentsRouted)?;
        if let Err(e) = self.quote.check_execution(executed_input_minor) {
            return self.commit(
                event_id,
                SettlementEvent::LiquidityCheckFailed,
                &payload,
                now,
                format!("route rejected: {e}"),
            );
        }
        if let Err(e) = liquidity.consume(self.quote.xents_out, now) {
            return self.commit(
                event_id,
                SettlementEvent::LiquidityCheckFailed,
                &payload,
                now,
                format!("route rejected: {e}"),
            );
        }
        let intent = router.route_exact_output(
            &self.settlement_id,
            self.quote.xents_out,
            executed_input_minor,
        );
        self.intents.push(intent);
        self.commit(
            event_id,
            SettlementEvent::XentsRouted,
            &payload,
            now,
            "exact-output XENTS routed (intent recorded)",
        )
    }

    pub fn initiate_nft_transfer<N: NftTransfer>(
        &mut self,
        event_id: &str,
        nft: &mut N,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        if let Some(r) = self.idempotency(event_id, SettlementEvent::NftTransferInitiated, "")? {
            return Ok(r);
        }
        self.peek(SettlementEvent::NftTransferInitiated)?;
        let intent = nft.transfer(
            &self.settlement_id,
            &self.nft.chain,
            &self.nft.token_ref,
            &self.nft.buyer,
        );
        self.intents.push(intent);
        self.transfer_started_at = Some(now);
        self.commit(
            event_id,
            SettlementEvent::NftTransferInitiated,
            "",
            now,
            "NFT transfer submitted on native chain (intent recorded)",
        )
    }

    /// Feed observed confirmations. Threshold -> NFT_TRANSFER_CONFIRMED,
    /// timeout -> CHAIN_CONFIRMATION_TIMEOUT, otherwise recorded, unchanged.
    pub fn observe_confirmations(
        &mut self,
        event_id: &str,
        policy: &ConfirmationPolicy,
        observed: u32,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        let payload = format!("{observed}@{now}");
        let started = self
            .transfer_started_at
            .ok_or(SettlementError::TransferNotStarted)?;
        let status = policy.evaluate(observed, started, now);
        let event = match status {
            ConfirmationStatus::Confirmed { .. } => SettlementEvent::NftTransferConfirmed,
            ConfirmationStatus::TimedOut { .. } => SettlementEvent::ConfirmationTimeout,
            ConfirmationStatus::Pending { .. } => SettlementEvent::NftTransferConfirmed,
        };
        if let Some(r) = self.idempotency(event_id, event, &payload)? {
            return Ok(r);
        }
        if matches!(status, ConfirmationStatus::Pending { .. }) {
            self.peek(event)?;
            return Ok(self.record_unchanged(
                event_id,
                event,
                &payload,
                now,
                format!("confirmations pending: {status:?}"),
            ));
        }
        self.peek(event)?;
        if event == SettlementEvent::NftTransferConfirmed {
            self.nft_transfer_confirmed = true;
        }
        self.commit(event_id, event, &payload, now, format!("{status:?}"))
    }

    pub fn fail_nft_transfer(
        &mut self,
        event_id: &str,
        reason: &str,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        if let Some(r) = self.idempotency(event_id, SettlementEvent::NftTransferFailed, reason)? {
            return Ok(r);
        }
        self.peek(SettlementEvent::NftTransferFailed)?;
        self.commit(
            event_id,
            SettlementEvent::NftTransferFailed,
            reason,
            now,
            reason,
        )
    }

    pub fn nft_ownership_changed(
        &mut self,
        event_id: &str,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        if let Some(r) = self.idempotency(event_id, SettlementEvent::NftOwnershipChanged, "")? {
            return Ok(r);
        }
        self.peek(SettlementEvent::NftOwnershipChanged)?;
        self.commit(
            event_id,
            SettlementEvent::NftOwnershipChanged,
            "",
            now,
            "seller no longer owns the NFT",
        )
    }

    /// Release the full reserve to the seller. Requires the NFT leg confirmed.
    pub fn release_usdc<P: UsdcPayout>(
        &mut self,
        event_id: &str,
        payout: &mut P,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        if let Some(r) = self.idempotency(event_id, SettlementEvent::UsdcReleased, "")? {
            return Ok(r);
        }
        self.peek(SettlementEvent::UsdcReleased)?;
        if !self.nft_transfer_confirmed {
            return Err(SettlementError::LegsNotVerified {
                nft_transfer_confirmed: false,
                usdc_released: false,
            });
        }
        let amount = self.usdc_reserve.outstanding();
        self.usdc_reserve.release(amount)?;
        let intent = payout.payout(&self.settlement_id, amount, &self.nft.seller);
        self.intents.push(intent);
        self.usdc_released = true;
        self.commit(
            event_id,
            SettlementEvent::UsdcReleased,
            "",
            now,
            "reserved USDC released to seller (intent recorded)",
        )
    }

    pub fn fail_usdc_payout(
        &mut self,
        event_id: &str,
        reason: &str,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        if let Some(r) = self.idempotency(event_id, SettlementEvent::UsdcPayoutFailed, reason)? {
            return Ok(r);
        }
        self.peek(SettlementEvent::UsdcPayoutFailed)?;
        self.commit(
            event_id,
            SettlementEvent::UsdcPayoutFailed,
            reason,
            now,
            reason,
        )
    }

    pub fn finalize(&mut self, event_id: &str, now: u64) -> Result<Applied, SettlementError> {
        if let Some(r) = self.idempotency(event_id, SettlementEvent::ReceiptFinalized, "")? {
            return Ok(r);
        }
        self.peek(SettlementEvent::ReceiptFinalized)?;
        if !(self.nft_transfer_confirmed && self.usdc_released) {
            return Err(SettlementError::LegsNotVerified {
                nft_transfer_confirmed: self.nft_transfer_confirmed,
                usdc_released: self.usdc_released,
            });
        }
        self.commit(
            event_id,
            SettlementEvent::ReceiptFinalized,
            "",
            now,
            "both legs verified; receipt finalized",
        )
    }

    /// Compensating refund of accepted buyer input.
    pub fn initiate_refund<R: InputRail>(
        &mut self,
        event_id: &str,
        rail: &mut R,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        if let Some(r) = self.idempotency(event_id, SettlementEvent::RefundInitiated, "")? {
            return Ok(r);
        }
        self.peek(SettlementEvent::RefundInitiated)?;
        let amount = self.buyer_input.refundable();
        if !self.buyer_input_accepted || amount == 0 {
            return Err(SettlementError::NothingToRefund);
        }
        let intent = rail.refund(&self.settlement_id, self.quote.input_asset, amount);
        self.intents.push(intent);
        self.commit(
            event_id,
            SettlementEvent::RefundInitiated,
            "",
            now,
            "compensating refund initiated (intent recorded)",
        )
    }

    pub fn complete_refund(
        &mut self,
        event_id: &str,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        if let Some(r) = self.idempotency(event_id, SettlementEvent::RefundCompleted, "")? {
            return Ok(r);
        }
        self.peek(SettlementEvent::RefundCompleted)?;
        let amount = self.buyer_input.refundable();
        self.buyer_input.refund(amount)?;
        self.commit(
            event_id,
            SettlementEvent::RefundCompleted,
            "",
            now,
            "buyer input fully refunded",
        )
    }

    pub fn fail_refund(
        &mut self,
        event_id: &str,
        reason: &str,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        if let Some(r) = self.idempotency(event_id, SettlementEvent::RefundFailed, reason)? {
            return Ok(r);
        }
        self.peek(SettlementEvent::RefundFailed)?;
        self.commit(event_id, SettlementEvent::RefundFailed, reason, now, reason)
    }

    pub fn escalate(
        &mut self,
        event_id: &str,
        reason: &str,
        now: u64,
    ) -> Result<Applied, SettlementError> {
        if let Some(r) =
            self.idempotency(event_id, SettlementEvent::EscalateManualReview, reason)?
        {
            return Ok(r);
        }
        self.peek(SettlementEvent::EscalateManualReview)?;
        self.commit(
            event_id,
            SettlementEvent::EscalateManualReview,
            reason,
            now,
            reason,
        )
    }

    pub fn receipt(&self, issued_at: u64) -> Receipt {
        Receipt {
            banner: MOCK_BANNER.to_string(),
            mock: true,
            settlement_id: self.settlement_id.clone(),
            quote_id: self.quote.quote_id.clone(),
            final_state: self.state,
            state_history: self.history.clone(),
            nft_transfer_confirmed: self.nft_transfer_confirmed,
            usdc_released: self.usdc_released,
            usdc_reserve: self.usdc_reserve,
            buyer_input: self.buyer_input,
            intents: self.intents.clone(),
            issued_at,
        }
    }
}
