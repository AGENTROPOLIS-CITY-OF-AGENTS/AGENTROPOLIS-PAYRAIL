use greenrails_settlement::*;
use proptest::prelude::*;

#[derive(Debug, Clone)]
enum ReserveOp {
    Reserve(u64),
    Release(u64),
    FreeAll,
}

fn reserve_ops() -> impl Strategy<Value = Vec<ReserveOp>> {
    prop::collection::vec(
        prop_oneof![
            (0u64..=u64::MAX).prop_map(ReserveOp::Reserve),
            (0u64..=u64::MAX).prop_map(ReserveOp::Release),
            Just(ReserveOp::FreeAll),
        ],
        0..40,
    )
}

proptest! {
    #[test]
    fn reserve_never_negative_and_outflow_never_exceeds_reserved(ops in reserve_ops()) {
        let mut r = UsdcReserve::default();
        for op in ops {
            let _ = match op {
                ReserveOp::Reserve(a) => r.reserve(a),
                ReserveOp::Release(a) => r.release(a),
                ReserveOp::FreeAll => r.free_all().map(|_| ()),
            };
            prop_assert!(r.check().is_ok());
            prop_assert!(r.released.checked_add(r.freed).unwrap() <= r.reserved);
            prop_assert_eq!(r.outstanding(), r.reserved - r.released - r.freed);
        }
    }

    #[test]
    fn buyer_refund_never_exceeds_authorized(
        auth in prop::collection::vec(0u64..=u64::MAX / 4, 0..8),
        refunds in prop::collection::vec(0u64..=u64::MAX, 0..16),
    ) {
        let mut b = BuyerInput::default();
        for a in auth {
            let _ = b.authorize(a);
        }
        for x in refunds {
            let _ = b.refund(x);
            prop_assert!(b.refunded <= b.authorized);
        }
    }

    #[test]
    fn liquidity_window_never_exceeds_cap(
        cap in 1u64..1_000_000,
        per_quote in 1u64..1_000_000,
        reqs in prop::collection::vec((0u64..2_000_000, 0u64..10_000), 0..50),
    ) {
        let policy = LiquidityPolicy { per_quote_cap_xents: per_quote, per_window_cap_xents: cap, window_secs: 3600 };
        let mut w = LiquidityWindow::new(policy, 0);
        for (x, t) in reqs {
            let _ = w.consume(x, t);
            prop_assert!(w.used_xents <= cap);
        }
    }

    #[test]
    fn slippage_ceiling_bounds_execution(
        quoted in 0u64..u64::MAX / 20_000,
        bps in 0u64..10_000,
        executed in 0u64..u64::MAX / 20_000,
    ) {
        let q = Quote {
            quote_id: "q".into(),
            input_asset: InputAsset::Usdc,
            xents_out: 1,
            quoted_input_minor: quoted,
            max_input_minor: u64::MAX,
            slippage_bps_cap: bps,
            seller_usdc_minor: 1,
            created_at: 0,
            expires_at: 1,
        };
        let ceiling = q.slippage_ceiling().unwrap();
        prop_assert!(ceiling >= quoted);
        prop_assert_eq!(q.check_execution(executed).is_ok(), executed <= ceiling);
    }

    /// Random event walks over the pure state machine never reach a
    /// success-path state out of order and never leave a terminal state.
    #[test]
    fn random_walks_respect_ordering(walk in prop::collection::vec(0usize..18, 0..30)) {
        let mut s = SettlementState::Quoted;
        let mut seen_confirmed = false;
        let mut seen_released = false;
        for i in walk {
            let e = SettlementEvent::ALL[i];
            let was_terminal = s.is_terminal();
            match transition(s, e) {
                Ok(next) => {
                    prop_assert!(!was_terminal);
                    if next == SettlementState::InputAuthorized {
                        prop_assert_eq!(s, SettlementState::UsdcReserved);
                    }
                    if next == SettlementState::NftTransferConfirmed { seen_confirmed = true; }
                    if next == SettlementState::UsdcReleased { prop_assert!(seen_confirmed); seen_released = true; }
                    if next == SettlementState::ReceiptFinalized { prop_assert!(seen_confirmed && seen_released); }
                    s = next;
                }
                Err(err) => prop_assert_eq!(err, InvalidTransition { from: s, event: e }),
            }
        }
    }
}
