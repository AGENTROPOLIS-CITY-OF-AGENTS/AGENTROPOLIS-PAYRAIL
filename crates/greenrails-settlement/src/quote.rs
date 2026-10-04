//! Exact-output $XENTS quotes, slippage caps and liquidity windows.

use serde::{Deserialize, Serialize};
use std::fmt;

pub const BPS_DENOMINATOR: u64 = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InputAsset {
    Card,
    Usdc,
    Crypto,
}

/// A GREENRAILS exact-output quote: the buyer receives exactly `xents_out`
/// and pays at most `max_input_minor` of `input_asset`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Quote {
    pub quote_id: String,
    pub input_asset: InputAsset,
    /// Exact $XENTS output (minor units).
    pub xents_out: u64,
    /// Input the oracle quoted at creation (minor units of `input_asset`).
    pub quoted_input_minor: u64,
    /// Hard cap on input the buyer authorizes.
    pub max_input_minor: u64,
    /// Max tolerated move between quoted and executed input, in bps.
    pub slippage_bps_cap: u64,
    /// Seller payout in USDC minor units (6 decimals), reserved before input.
    pub seller_usdc_minor: u64,
    pub created_at: u64,
    pub expires_at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QuoteError {
    Expired { now: u64, expires_at: u64 },
    MaxInputBelowQuoted,
    SlippageExceeded { executed: u64, cap: u64 },
    MaxInputExceeded { executed: u64, max: u64 },
    PerQuoteCapExceeded { requested: u64, cap: u64 },
    PerWindowCapExceeded { requested: u64, remaining: u64 },
    Overflow,
}

impl fmt::Display for QuoteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}

impl std::error::Error for QuoteError {}

impl Quote {
    pub fn validate(&self) -> Result<(), QuoteError> {
        if self.max_input_minor < self.quoted_input_minor {
            return Err(QuoteError::MaxInputBelowQuoted);
        }
        Ok(())
    }

    pub fn is_expired(&self, now: u64) -> bool {
        now >= self.expires_at
    }

    pub fn check_not_expired(&self, now: u64) -> Result<(), QuoteError> {
        if self.is_expired(now) {
            return Err(QuoteError::Expired {
                now,
                expires_at: self.expires_at,
            });
        }
        Ok(())
    }

    /// Highest input the slippage cap allows: quoted * (1 + cap_bps).
    pub fn slippage_ceiling(&self) -> Result<u64, QuoteError> {
        let extra = self
            .quoted_input_minor
            .checked_mul(self.slippage_bps_cap)
            .ok_or(QuoteError::Overflow)?
            / BPS_DENOMINATOR;
        self.quoted_input_minor
            .checked_add(extra)
            .ok_or(QuoteError::Overflow)
    }

    /// Validate the input the router actually needs to deliver exact output.
    pub fn check_execution(&self, executed_input_minor: u64) -> Result<(), QuoteError> {
        if executed_input_minor > self.max_input_minor {
            return Err(QuoteError::MaxInputExceeded {
                executed: executed_input_minor,
                max: self.max_input_minor,
            });
        }
        let cap = self.slippage_ceiling()?;
        if executed_input_minor > cap {
            return Err(QuoteError::SlippageExceeded {
                executed: executed_input_minor,
                cap,
            });
        }
        Ok(())
    }
}

/// Per-quote and rolling per-window $XENTS liquidity caps.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct LiquidityPolicy {
    pub per_quote_cap_xents: u64,
    pub per_window_cap_xents: u64,
    pub window_secs: u64,
}

/// Tracks $XENTS routed in the current window. Pure; caller supplies `now`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct LiquidityWindow {
    pub policy: LiquidityPolicy,
    pub window_start: u64,
    pub used_xents: u64,
}

impl LiquidityWindow {
    pub fn new(policy: LiquidityPolicy, now: u64) -> Self {
        Self {
            policy,
            window_start: now,
            used_xents: 0,
        }
    }

    fn roll(&mut self, now: u64) {
        if now.saturating_sub(self.window_start) >= self.policy.window_secs {
            self.window_start = now;
            self.used_xents = 0;
        }
    }

    pub fn remaining(&mut self, now: u64) -> u64 {
        self.roll(now);
        self.policy
            .per_window_cap_xents
            .saturating_sub(self.used_xents)
    }

    /// Check caps without consuming.
    pub fn check(&mut self, xents: u64, now: u64) -> Result<(), QuoteError> {
        if xents > self.policy.per_quote_cap_xents {
            return Err(QuoteError::PerQuoteCapExceeded {
                requested: xents,
                cap: self.policy.per_quote_cap_xents,
            });
        }
        let remaining = self.remaining(now);
        if xents > remaining {
            return Err(QuoteError::PerWindowCapExceeded {
                requested: xents,
                remaining,
            });
        }
        Ok(())
    }

    /// Check caps and consume window liquidity.
    pub fn consume(&mut self, xents: u64, now: u64) -> Result<(), QuoteError> {
        self.check(xents, now)?;
        self.used_xents = self
            .used_xents
            .checked_add(xents)
            .ok_or(QuoteError::Overflow)?;
        Ok(())
    }
}
