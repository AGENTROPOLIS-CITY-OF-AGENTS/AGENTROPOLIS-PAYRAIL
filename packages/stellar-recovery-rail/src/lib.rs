#![forbid(unsafe_code)]

//! Deterministic policy evaluation for Agentropolis fiscal execution.
//! Custody, signing, secrets, and network submission remain in external adapters.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetControl {
    NativeXlm,
    ClawbackEnabledStellarAsset,
    SorobanEscrow,
    ExternalIrreversible,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Decision {
    Deny,
    Hold,
    RequireGuardianQuorum,
    Approve,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Policy {
    pub max_transaction_units: u128,
    pub max_daily_units: u128,
    pub max_reserve_outflow_bps: u16,
    pub guardian_threshold_units: u128,
    pub cooling_window_seconds: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Intent {
    pub amount_units: u128,
    pub daily_spent_units: u128,
    pub reserve_units: u128,
    pub asset_control: AssetControl,
    pub destination_allowed: bool,
    pub mandate_valid: bool,
    pub simulation_passed: bool,
    pub anomaly_detected: bool,
    pub cooling_window_elapsed: bool,
    pub guardian_approvals: u8,
    pub guardian_quorum: u8,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Evaluation {
    pub decision: Decision,
    pub reason: &'static str,
    pub recoverable_before_execution: bool,
    pub recoverable_after_execution: bool,
}

pub fn evaluate(policy: Policy, intent: Intent) -> Evaluation {
    let deny = |reason| Evaluation {
        decision: Decision::Deny,
        reason,
        recoverable_before_execution: true,
        recoverable_after_execution: is_recoverable_after(intent.asset_control),
    };

    if !intent.mandate_valid {
        return deny("mandate_invalid");
    }
    if !intent.destination_allowed {
        return deny("destination_not_allowed");
    }
    if !intent.simulation_passed {
        return deny("simulation_failed");
    }
    if intent.anomaly_detected {
        return deny("anomaly_detected");
    }
    if intent.amount_units == 0 || intent.amount_units > policy.max_transaction_units {
        return deny("transaction_limit_exceeded");
    }
    if intent.daily_spent_units.saturating_add(intent.amount_units) > policy.max_daily_units {
        return deny("daily_limit_exceeded");
    }
    if policy.max_reserve_outflow_bps > 10_000 || intent.reserve_units == 0 {
        return deny("reserve_policy_invalid");
    }

    let outflow_bps = intent
        .amount_units
        .saturating_mul(10_000)
        .checked_div(intent.reserve_units)
        .unwrap_or(u128::MAX);
    if outflow_bps > u128::from(policy.max_reserve_outflow_bps) {
        return deny("reserve_outflow_limit_exceeded");
    }

    if policy.cooling_window_seconds > 0 && !intent.cooling_window_elapsed {
        return Evaluation {
            decision: Decision::Hold,
            reason: "cooling_window_active",
            recoverable_before_execution: true,
            recoverable_after_execution: is_recoverable_after(intent.asset_control),
        };
    }

    let irreversible = matches!(
        intent.asset_control,
        AssetControl::NativeXlm | AssetControl::ExternalIrreversible
    );
    let high_value = intent.amount_units >= policy.guardian_threshold_units;
    if (irreversible || high_value) && intent.guardian_quorum == 0 {
        return deny("guardian_policy_invalid");
    }
    if (irreversible || high_value) && intent.guardian_approvals < intent.guardian_quorum {
        return Evaluation {
            decision: Decision::RequireGuardianQuorum,
            reason: "guardian_quorum_required",
            recoverable_before_execution: true,
            recoverable_after_execution: is_recoverable_after(intent.asset_control),
        };
    }

    Evaluation {
        decision: Decision::Approve,
        reason: "policy_satisfied",
        recoverable_before_execution: true,
        recoverable_after_execution: is_recoverable_after(intent.asset_control),
    }
}

const fn is_recoverable_after(control: AssetControl) -> bool {
    matches!(
        control,
        AssetControl::ClawbackEnabledStellarAsset | AssetControl::SorobanEscrow
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy() -> Policy {
        Policy {
            max_transaction_units: 1_000,
            max_daily_units: 5_000,
            max_reserve_outflow_bps: 500,
            guardian_threshold_units: 500,
            cooling_window_seconds: 259_200,
        }
    }

    fn intent() -> Intent {
        Intent {
            amount_units: 100,
            daily_spent_units: 0,
            reserve_units: 10_000,
            asset_control: AssetControl::ClawbackEnabledStellarAsset,
            destination_allowed: true,
            mandate_valid: true,
            simulation_passed: true,
            anomaly_detected: false,
            cooling_window_elapsed: true,
            guardian_approvals: 0,
            guardian_quorum: 2,
        }
    }

    #[test]
    fn denies_reserve_drain_even_with_valid_authority() {
        let mut candidate = intent();
        candidate.amount_units = 951;
        candidate.reserve_units = 1_000;
        assert_eq!(
            evaluate(policy(), candidate).reason,
            "reserve_outflow_limit_exceeded"
        );
    }

    #[test]
    fn holds_until_cooling_window_elapses() {
        let mut candidate = intent();
        candidate.cooling_window_elapsed = false;
        assert_eq!(evaluate(policy(), candidate).decision, Decision::Hold);
    }

    #[test]
    fn native_xlm_requires_guardians_and_is_not_recoverable_afterward() {
        let mut candidate = intent();
        candidate.asset_control = AssetControl::NativeXlm;
        let result = evaluate(policy(), candidate);
        assert_eq!(result.decision, Decision::RequireGuardianQuorum);
        assert!(!result.recoverable_after_execution);
    }

    #[test]
    fn denies_zero_guardian_configuration_for_irreversible_assets() {
        let mut candidate = intent();
        candidate.asset_control = AssetControl::NativeXlm;
        candidate.guardian_quorum = 0;
        assert_eq!(
            evaluate(policy(), candidate).reason,
            "guardian_policy_invalid"
        );
    }

    #[test]
    fn approves_bounded_recoverable_asset() {
        let result = evaluate(policy(), intent());
        assert_eq!(result.decision, Decision::Approve);
        assert!(result.recoverable_after_execution);
    }
}
