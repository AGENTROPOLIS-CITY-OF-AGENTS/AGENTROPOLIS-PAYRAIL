//! Chain confirmation thresholds and timeouts for the NFT transfer leg.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConfirmationPolicy {
    pub required_confirmations: u32,
    pub timeout_secs: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConfirmationStatus {
    Pending { observed: u32, required: u32 },
    Confirmed { observed: u32 },
    TimedOut { observed: u32, elapsed_secs: u64 },
}

impl ConfirmationPolicy {
    /// Confirmation wins over timeout when both hold at `now`: once the
    /// threshold is met the transfer is final regardless of elapsed time.
    pub fn evaluate(&self, observed: u32, started_at: u64, now: u64) -> ConfirmationStatus {
        if observed >= self.required_confirmations {
            return ConfirmationStatus::Confirmed { observed };
        }
        let elapsed = now.saturating_sub(started_at);
        if elapsed >= self.timeout_secs {
            return ConfirmationStatus::TimedOut {
                observed,
                elapsed_secs: elapsed,
            };
        }
        ConfirmationStatus::Pending {
            observed,
            required: self.required_confirmations,
        }
    }
}
