//! Reserve and buyer-input ledgers. Pure arithmetic with checked invariants.
//! Amounts are minor units (USDC: 6 decimals; card/crypto inputs: minor units
//! of their own asset). No value ever moves; this only records intents.

use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LedgerError {
    ReserveWouldGoNegative,
    ReleaseExceedsReserved,
    RefundExceedsAuthorized,
    AlreadyReserved,
    NothingReserved,
    Overflow,
}

impl fmt::Display for LedgerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}

impl std::error::Error for LedgerError {}

/// Seller-side USDC (Base) reserve held by GREENRAILS for one settlement.
///
/// Invariant: `released + freed <= reserved`, and `reserved` is never negative
/// (u64 plus checked arithmetic).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct UsdcReserve {
    pub reserved: u64,
    pub released: u64,
    pub freed: u64,
}

impl UsdcReserve {
    pub fn reserve(&mut self, amount: u64) -> Result<(), LedgerError> {
        if self.reserved != 0 {
            return Err(LedgerError::AlreadyReserved);
        }
        self.reserved = amount;
        Ok(())
    }

    /// Amount still held: reserved - released - freed.
    pub fn outstanding(&self) -> u64 {
        self.reserved
            .saturating_sub(self.released)
            .saturating_sub(self.freed)
    }

    pub fn is_fully_reserved(&self) -> bool {
        self.reserved > 0 && self.released == 0 && self.freed == 0
    }

    /// Release USDC to the seller (payout). Only the outstanding amount may move.
    pub fn release(&mut self, amount: u64) -> Result<(), LedgerError> {
        if self.reserved == 0 {
            return Err(LedgerError::NothingReserved);
        }
        if amount > self.outstanding() {
            return Err(LedgerError::ReleaseExceedsReserved);
        }
        self.released = self
            .released
            .checked_add(amount)
            .ok_or(LedgerError::Overflow)?;
        self.check()
    }

    /// Return outstanding USDC to the liquidity pool (quote expiry / failure).
    pub fn free_all(&mut self) -> Result<u64, LedgerError> {
        let amount = self.outstanding();
        self.freed = self
            .freed
            .checked_add(amount)
            .ok_or(LedgerError::Overflow)?;
        self.check()?;
        Ok(amount)
    }

    pub fn check(&self) -> Result<(), LedgerError> {
        let used = self
            .released
            .checked_add(self.freed)
            .ok_or(LedgerError::Overflow)?;
        if used > self.reserved {
            return Err(LedgerError::ReserveWouldGoNegative);
        }
        Ok(())
    }
}

/// Buyer-side input (card / USDC / crypto) accepted for one settlement.
///
/// Invariant: `refunded <= authorized`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct BuyerInput {
    pub authorized: u64,
    pub refunded: u64,
}

impl BuyerInput {
    pub fn authorize(&mut self, amount: u64) -> Result<(), LedgerError> {
        self.authorized = self
            .authorized
            .checked_add(amount)
            .ok_or(LedgerError::Overflow)?;
        Ok(())
    }

    pub fn refundable(&self) -> u64 {
        self.authorized.saturating_sub(self.refunded)
    }

    pub fn refund(&mut self, amount: u64) -> Result<(), LedgerError> {
        if amount > self.refundable() {
            return Err(LedgerError::RefundExceedsAuthorized);
        }
        self.refunded = self
            .refunded
            .checked_add(amount)
            .ok_or(LedgerError::Overflow)?;
        Ok(())
    }
}
