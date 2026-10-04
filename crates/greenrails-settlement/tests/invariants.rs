use greenrails_settlement::*;

const NOW: u64 = 1_700_000_000;

fn quote(asset: InputAsset) -> Quote {
    Quote {
        quote_id: "q-1".into(),
        input_asset: asset,
        xents_out: 1_000_000,
        quoted_input_minor: 2_500,
        max_input_minor: 2_600,
        slippage_bps_cap: 200,
        seller_usdc_minor: 20_000_000,
        created_at: NOW,
        expires_at: NOW + 300,
    }
}

fn nft() -> NftRef {
    NftRef {
        chain: "ethereum-mainnet".into(),
        token_ref: "legacy:0xabc/42".into(),
        seller: "seller.eth".into(),
        buyer: "buyer.eth".into(),
    }
}

fn liquidity() -> LiquidityWindow {
    LiquidityWindow::new(
        LiquidityPolicy {
            per_quote_cap_xents: 5_000_000,
            per_window_cap_xents: 10_000_000,
            window_secs: 3600,
        },
        NOW,
    )
}

fn policy() -> ConfirmationPolicy {
    ConfirmationPolicy {
        required_confirmations: 12,
        timeout_secs: 900,
    }
}

fn to_input_authorized(p: &mut MockProviders, lq: &mut LiquidityWindow) -> Settlement {
    let mut s = Settlement::new("s-1", quote(InputAsset::Card), nft()).unwrap();
    s.reserve_usdc("e1", lq, NOW).unwrap();
    s.authorize_input("e2", &mut p.input, 2_500, NOW + 1)
        .unwrap();
    assert_eq!(s.state, SettlementState::InputAuthorized);
    s
}

fn to_pending(p: &mut MockProviders, lq: &mut LiquidityWindow) -> Settlement {
    let mut s = to_input_authorized(p, lq);
    s.route_xents("e3", &mut p.router, lq, 2_520, NOW + 2)
        .unwrap();
    s.initiate_nft_transfer("e4", &mut p.nft, NOW + 3).unwrap();
    assert_eq!(s.state, SettlementState::NftTransferPending);
    s
}

#[test]
fn canonical_state_names_and_counts() {
    assert_eq!(SettlementState::SUCCESS_PATH.len(), 8);
    assert_eq!(SettlementState::FAILURE_STATES.len(), 10);
    assert_eq!(SettlementState::ALL.len(), 18);
    let names: Vec<&str> = SettlementState::ALL.iter().map(|s| s.as_str()).collect();
    assert_eq!(
        names,
        [
            "QUOTED",
            "USDC_RESERVED",
            "INPUT_AUTHORIZED",
            "XENTS_ROUTED",
            "NFT_TRANSFER_PENDING",
            "NFT_TRANSFER_CONFIRMED",
            "USDC_RELEASED",
            "RECEIPT_FINALIZED",
            "QUOTE_EXPIRED",
            "INPUT_FAILED",
            "INSUFFICIENT_LIQUIDITY",
            "NFT_OWNERSHIP_CHANGED",
            "NFT_TRANSFER_FAILED",
            "CHAIN_CONFIRMATION_TIMEOUT",
            "USDC_PAYOUT_FAILED",
            "REFUND_PENDING",
            "REFUNDED",
            "MANUAL_REVIEW",
        ]
    );
    for s in SettlementState::ALL {
        assert_eq!(
            serde_json::to_string(&s).unwrap(),
            format!("\"{}\"", s.as_str())
        );
    }
}

#[test]
fn success_path_is_strictly_linear() {
    let path = SettlementState::SUCCESS_PATH;
    let events = [
        SettlementEvent::UsdcReserved,
        SettlementEvent::InputAuthorized,
        SettlementEvent::XentsRouted,
        SettlementEvent::NftTransferInitiated,
        SettlementEvent::NftTransferConfirmed,
        SettlementEvent::UsdcReleased,
        SettlementEvent::ReceiptFinalized,
    ];
    for (i, e) in events.iter().enumerate() {
        assert_eq!(transition(path[i], *e).unwrap(), path[i + 1]);
    }
    // No success state can be skipped: only one success-path successor each.
    for s in path.iter().take(7) {
        let succ: Vec<_> = allowed_events(*s)
            .into_iter()
            .map(|e| transition(*s, e).unwrap())
            .filter(|t| t.is_success_path())
            .collect();
        assert_eq!(succ.len(), 1, "{s} has {succ:?}");
    }
}

#[test]
fn everything_not_allow_listed_is_rejected() {
    let mut allowed = 0;
    for s in SettlementState::ALL {
        for e in SettlementEvent::ALL {
            match transition(s, e) {
                Ok(_) => allowed += 1,
                Err(err) => assert_eq!(err, InvalidTransition { from: s, event: e }),
            }
        }
    }
    assert_eq!(allowed, 31, "allow-list size changed; update docs");
    for t in [
        SettlementState::ReceiptFinalized,
        SettlementState::QuoteExpired,
        SettlementState::InputFailed,
        SettlementState::Refunded,
        SettlementState::ManualReview,
    ] {
        assert!(allowed_events(t).is_empty(), "{t} must be terminal");
    }
}

#[test]
fn input_authorized_unreachable_without_usdc_reserved() {
    for s in SettlementState::ALL {
        let ok = transition(s, SettlementEvent::InputAuthorized).is_ok();
        assert_eq!(ok, s == SettlementState::UsdcReserved, "{s}");
    }
    // Aggregate: reserve ledger must actually hold funds.
    let mut s = Settlement::new("s", quote(InputAsset::Card), nft()).unwrap();
    let mut rail = MockInputRail::default();
    assert!(matches!(
        s.authorize_input("e", &mut rail, 2_500, NOW),
        Err(SettlementError::Invalid(_))
    ));
    assert!(
        rail.intents.is_empty(),
        "no intent recorded without reserve"
    );
}

#[test]
fn receipt_finalized_requires_both_legs() {
    for s in SettlementState::ALL {
        let ok = transition(s, SettlementEvent::ReceiptFinalized).is_ok();
        assert_eq!(ok, s == SettlementState::UsdcReleased, "{s}");
    }
    let mut p = MockProviders::default();
    let mut lq = liquidity();
    let mut s = to_pending(&mut p, &mut lq);
    assert!(matches!(
        s.finalize("x", NOW),
        Err(SettlementError::Invalid(_))
    ));
    // Cannot release USDC before NFT confirmed.
    assert!(matches!(
        s.release_usdc("x", &mut p.payout, NOW),
        Err(SettlementError::Invalid(_))
    ));
    s.observe_confirmations("e5", &policy(), 12, NOW + 10)
        .unwrap();
    s.release_usdc("e6", &mut p.payout, NOW + 11).unwrap();
    s.finalize("e7", NOW + 12).unwrap();
    assert_eq!(s.state, SettlementState::ReceiptFinalized);
    assert!(s.nft_transfer_confirmed && s.usdc_released);
    assert_eq!(s.usdc_reserve.released, 20_000_000);
    assert_eq!(s.usdc_reserve.outstanding(), 0);

    // Receipt signer refuses a forged "finalized" receipt missing a leg.
    let mut r = s.receipt(NOW + 13);
    r.usdc_released = false;
    assert_eq!(sign_dev(r), Err(ReceiptError::FinalizedWithoutBothLegs));
}

#[test]
fn quote_expiry_frees_reserve() {
    let mut lq = liquidity();
    let mut s = Settlement::new("s", quote(InputAsset::Usdc), nft()).unwrap();
    s.reserve_usdc("e1", &mut lq, NOW).unwrap();
    assert_eq!(s.usdc_reserve.outstanding(), 20_000_000);
    assert_eq!(s.tick("t1", NOW + 10).unwrap(), Applied::Unchanged);
    let r = s.tick("t2", NOW + 300).unwrap();
    assert_eq!(
        r,
        Applied::Transitioned {
            from: SettlementState::UsdcReserved,
            to: SettlementState::QuoteExpired
        }
    );
    assert_eq!(s.usdc_reserve.outstanding(), 0);
    assert_eq!(s.usdc_reserve.freed, 20_000_000);
    assert!(s.is_terminal());
    assert!(!s.has_open_obligation());

    // Expired at authorization: no input accepted.
    let mut s = Settlement::new("s2", quote(InputAsset::Card), nft()).unwrap();
    let mut rail = MockInputRail::default();
    s.reserve_usdc("e1", &mut liquidity(), NOW).unwrap();
    s.authorize_input("e2", &mut rail, 2_500, NOW + 301)
        .unwrap();
    assert_eq!(s.state, SettlementState::QuoteExpired);
    assert!(rail.intents.is_empty());
    assert!(!s.buyer_input_accepted);
}

#[test]
fn post_input_failures_route_through_refund_or_manual_review() {
    for f in [
        SettlementState::InsufficientLiquidity,
        SettlementState::NftOwnershipChanged,
        SettlementState::NftTransferFailed,
        SettlementState::ChainConfirmationTimeout,
    ] {
        let targets: Vec<_> = allowed_events(f)
            .into_iter()
            .map(|e| transition(f, e).unwrap())
            .collect();
        assert_eq!(
            targets,
            [
                SettlementState::RefundPending,
                SettlementState::ManualReview
            ],
            "{f}"
        );
    }
    // Payout failed after the NFT moved: never refund the buyer; manual review only.
    let targets: Vec<_> = allowed_events(SettlementState::UsdcPayoutFailed)
        .into_iter()
        .map(|e| transition(SettlementState::UsdcPayoutFailed, e).unwrap())
        .collect();
    assert_eq!(targets, [SettlementState::ManualReview]);
    assert_eq!(
        allowed_events(SettlementState::RefundPending)
            .into_iter()
            .map(|e| transition(SettlementState::RefundPending, e).unwrap())
            .collect::<Vec<_>>(),
        [SettlementState::Refunded, SettlementState::ManualReview]
    );

    // Aggregate flow: NFT transfer failed -> refund -> refunded.
    let mut p = MockProviders::default();
    let mut lq = liquidity();
    let mut s = to_pending(&mut p, &mut lq);
    s.fail_nft_transfer("e5", "reverted", NOW + 10).unwrap();
    assert_eq!(s.state, SettlementState::NftTransferFailed);
    assert!(!s.is_terminal());
    assert!(s.has_open_obligation());
    assert_eq!(s.usdc_reserve.freed, 20_000_000, "reserve freed on failure");
    s.initiate_refund("e6", &mut p.input, NOW + 11).unwrap();
    s.complete_refund("e7", NOW + 12).unwrap();
    assert_eq!(s.state, SettlementState::Refunded);
    assert_eq!(s.buyer_input.refunded, s.buyer_input.authorized);
    assert!(s.is_terminal() && !s.has_open_obligation());
    assert!(p
        .input
        .intents
        .iter()
        .any(|i| i.kind == IntentKind::InputRefund && i.amount_minor == 2_500));

    // Pre-input INSUFFICIENT_LIQUIDITY: terminal, nothing to refund.
    let mut s = Settlement::new("s3", quote(InputAsset::Card), nft()).unwrap();
    let mut tiny = LiquidityWindow::new(
        LiquidityPolicy {
            per_quote_cap_xents: 1,
            per_window_cap_xents: 1,
            window_secs: 60,
        },
        NOW,
    );
    s.reserve_usdc("e1", &mut tiny, NOW).unwrap();
    assert_eq!(s.state, SettlementState::InsufficientLiquidity);
    assert!(s.is_terminal());
    assert_eq!(
        s.initiate_refund("e2", &mut p.input, NOW),
        Err(SettlementError::NothingToRefund)
    );
}

#[test]
fn usdc_payout_failed_goes_to_manual_review_and_keeps_reserve() {
    let mut p = MockProviders::default();
    let mut lq = liquidity();
    let mut s = to_pending(&mut p, &mut lq);
    s.observe_confirmations("e5", &policy(), 12, NOW + 10)
        .unwrap();
    s.fail_usdc_payout("e6", "payout rail unavailable", NOW + 11)
        .unwrap();
    assert_eq!(s.state, SettlementState::UsdcPayoutFailed);
    assert_eq!(
        s.usdc_reserve.outstanding(),
        20_000_000,
        "reserve stays held for the seller once the NFT moved"
    );
    assert!(matches!(
        s.initiate_refund("x", &mut p.input, NOW + 12),
        Err(SettlementError::Invalid(_))
    ));
    s.escalate("e7", "operator payout retry", NOW + 12).unwrap();
    assert_eq!(s.state, SettlementState::ManualReview);
    assert!(s.is_terminal());
}

#[test]
fn idempotent_replay_is_noop_and_conflict_is_error() {
    let mut p = MockProviders::default();
    let mut lq = liquidity();
    let mut s = Settlement::new("s", quote(InputAsset::Card), nft()).unwrap();
    s.reserve_usdc("e1", &mut lq, NOW).unwrap();
    let first = s.authorize_input("e2", &mut p.input, 2_500, NOW).unwrap();
    assert!(matches!(first, Applied::Transitioned { .. }));
    let replay = s.authorize_input("e2", &mut p.input, 2_500, NOW).unwrap();
    assert_eq!(replay, Applied::Replayed);
    assert_eq!(p.input.intents.len(), 1, "replay records no new intent");
    assert_eq!(s.buyer_input.authorized, 2_500);
    assert_eq!(s.log.len(), 2);

    let conflict = s.authorize_input("e2", &mut p.input, 2_600, NOW);
    assert!(matches!(
        conflict,
        Err(SettlementError::ConflictingDuplicate { .. })
    ));
    let conflict = s.route_xents("e2", &mut p.router, &mut lq, 2_500, NOW);
    assert!(matches!(
        conflict,
        Err(SettlementError::ConflictingDuplicate { .. })
    ));
    assert_eq!(s.state, SettlementState::InputAuthorized);
}

#[test]
fn slippage_max_input_and_liquidity_caps() {
    let q = quote(InputAsset::Crypto);
    assert_eq!(q.slippage_ceiling().unwrap(), 2_550);
    assert!(q.check_execution(2_550).is_ok());
    assert!(matches!(
        q.check_execution(2_551),
        Err(QuoteError::SlippageExceeded { .. })
    ));
    assert!(matches!(
        q.check_execution(2_601),
        Err(QuoteError::MaxInputExceeded { .. })
    ));
    let mut bad = q.clone();
    bad.max_input_minor = 2_000;
    assert_eq!(
        Settlement::new("s", bad, nft()).err(),
        Some(SettlementError::Quote(QuoteError::MaxInputBelowQuoted))
    );

    // Slippage breach at routing -> INSUFFICIENT_LIQUIDITY (post-input, refundable).
    let mut p = MockProviders::default();
    let mut lq = liquidity();
    let mut s = to_input_authorized(&mut p, &mut lq);
    s.route_xents("e3", &mut p.router, &mut lq, 2_560, NOW + 2)
        .unwrap();
    assert_eq!(s.state, SettlementState::InsufficientLiquidity);
    assert!(p.router.intents.is_empty());
    assert!(!s.is_terminal());
    s.initiate_refund("e4", &mut p.input, NOW + 3).unwrap();
    s.complete_refund("e5", NOW + 4).unwrap();
    assert_eq!(s.state, SettlementState::Refunded);

    // Per-window cap: 10M window, 1M per quote -> 11th route fails.
    let mut lq = liquidity();
    for i in 0..10 {
        lq.consume(1_000_000, NOW + i).unwrap();
    }
    assert!(matches!(
        lq.check(1_000_000, NOW + 10),
        Err(QuoteError::PerWindowCapExceeded { .. })
    ));
    let mut s = Settlement::new("s", quote(InputAsset::Card), nft()).unwrap();
    s.reserve_usdc("e1", &mut lq, NOW + 10).unwrap();
    assert_eq!(s.state, SettlementState::InsufficientLiquidity);
    // Window rolls over.
    assert!(lq.check(1_000_000, NOW + 3600).is_ok());

    // Per-quote cap.
    let mut lq = liquidity();
    let mut big = quote(InputAsset::Card);
    big.xents_out = 5_000_001;
    let mut s = Settlement::new("s", big, nft()).unwrap();
    s.reserve_usdc("e1", &mut lq, NOW).unwrap();
    assert_eq!(s.state, SettlementState::InsufficientLiquidity);
}

#[test]
fn confirmation_threshold_and_timeout() {
    let pol = policy();
    assert!(matches!(
        pol.evaluate(3, NOW, NOW + 10),
        ConfirmationStatus::Pending { .. }
    ));
    assert!(matches!(
        pol.evaluate(12, NOW, NOW + 10),
        ConfirmationStatus::Confirmed { .. }
    ));
    assert!(matches!(
        pol.evaluate(11, NOW, NOW + 900),
        ConfirmationStatus::TimedOut { .. }
    ));
    // Threshold met exactly at the deadline still confirms.
    assert!(matches!(
        pol.evaluate(12, NOW, NOW + 900),
        ConfirmationStatus::Confirmed { .. }
    ));

    let mut p = MockProviders::default();
    let mut lq = liquidity();
    let mut s = to_pending(&mut p, &mut lq);
    assert_eq!(
        s.observe_confirmations("c1", &pol, 4, NOW + 60).unwrap(),
        Applied::Unchanged
    );
    assert_eq!(s.state, SettlementState::NftTransferPending);
    s.observe_confirmations("c2", &pol, 9, NOW + 3 + 900)
        .unwrap();
    assert_eq!(s.state, SettlementState::ChainConfirmationTimeout);
    assert!(s.has_open_obligation());
    s.escalate("c3", "chain reorg suspected", NOW + 1000)
        .unwrap();
    assert_eq!(s.state, SettlementState::ManualReview);
}

#[test]
fn nft_ownership_changed_before_and_after_input() {
    let mut p = MockProviders::default();
    let mut lq = liquidity();
    let mut s = Settlement::new("s", quote(InputAsset::Card), nft()).unwrap();
    s.reserve_usdc("e1", &mut lq, NOW).unwrap();
    s.nft_ownership_changed("e2", NOW + 1).unwrap();
    assert_eq!(s.state, SettlementState::NftOwnershipChanged);
    assert!(s.is_terminal());
    assert_eq!(s.usdc_reserve.freed, 20_000_000);

    let mut s = to_input_authorized(&mut p, &mut lq);
    s.nft_ownership_changed("e3", NOW + 2).unwrap();
    assert!(!s.is_terminal());
    s.initiate_refund("e4", &mut p.input, NOW + 3).unwrap();
    s.complete_refund("e5", NOW + 4).unwrap();
    assert!(s.is_terminal());
}

#[test]
fn receipts_carry_banner_and_verify() {
    let mut p = MockProviders::default();
    let mut lq = liquidity();
    let mut s = to_pending(&mut p, &mut lq);
    s.observe_confirmations("e5", &policy(), 12, NOW + 10)
        .unwrap();
    s.release_usdc("e6", &mut p.payout, NOW + 11).unwrap();
    s.finalize("e7", NOW + 12).unwrap();
    let receipt = s.receipt(NOW + 13);
    assert_eq!(receipt.banner, "MOCK SETTLEMENT · NO FUNDS WILL MOVE");
    assert!(receipt.mock);
    for i in &receipt.intents {
        assert_eq!(i.banner, MOCK_BANNER);
        assert!(i.mock);
        assert!(i.reference.starts_with("mock-"));
    }
    let signed = sign_dev(receipt.clone()).unwrap();
    assert!(verify_dev(&signed).is_ok());
    // Deterministic.
    assert_eq!(
        sign_dev(receipt).unwrap().signature_hex,
        signed.signature_hex
    );
    // Canonical JSON is key-sorted.
    let canon = signed.receipt.canonical_json().unwrap();
    assert!(canon.starts_with("{\"banner\":"));
    // Tamper.
    let mut tampered = signed.clone();
    tampered.receipt.usdc_reserve.released += 1;
    assert_eq!(verify_dev(&tampered), Err(ReceiptError::BadSignature));
    let mut wrong_key = signed.clone();
    wrong_key.key_id = "prod".into();
    assert_eq!(verify_dev(&wrong_key), Err(ReceiptError::UnknownKey));
    assert_eq!(
        verify(&signed, DEV_RECEIPT_KEY_ID, b"other"),
        Err(ReceiptError::BadSignature)
    );
    let mut no_banner = s.receipt(NOW);
    no_banner.banner = "LIVE".into();
    assert_eq!(sign_dev(no_banner), Err(ReceiptError::MissingBanner));
}

#[test]
fn live_flag_defaults_false() {
    let live: bool = LIVE_FUNDS_ENABLED;
    assert!(!live);
}
