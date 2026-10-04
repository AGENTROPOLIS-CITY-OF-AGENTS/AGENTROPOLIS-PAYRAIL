//! `cargo run --example demo` prints JSON transcripts for each scenario and
//! writes them to `demo-transcripts/*.json`. MOCK SETTLEMENT · NO FUNDS WILL MOVE.

use greenrails_settlement::*;
use serde::Serialize;
use std::fs;
use std::path::Path;

const T0: u64 = 1_757_332_800; // 2025-09-08T12:00:00Z, fixed for determinism

#[derive(Serialize)]
struct Transcript {
    banner: &'static str,
    scenario: &'static str,
    final_state: SettlementState,
    terminal: bool,
    open_obligation: bool,
    state_history: Vec<SettlementState>,
    log: Vec<LogEntry>,
    usdc_reserve: UsdcReserve,
    buyer_input: BuyerInput,
    intents: Vec<Intent>,
    signed_receipt: SignedReceipt,
    receipt_verifies: bool,
}

fn quote(id: &str, asset: InputAsset) -> Quote {
    Quote {
        quote_id: id.into(),
        input_asset: asset,
        xents_out: 1_000_000,
        quoted_input_minor: 2_500,
        max_input_minor: 2_600,
        slippage_bps_cap: 200,
        seller_usdc_minor: 20_000_000,
        created_at: T0,
        expires_at: T0 + 300,
    }
}

fn nft() -> NftRef {
    NftRef {
        chain: "legacy-native-chain".into(),
        token_ref: "legacy-nft:0xLEGACY/42".into(),
        seller: "seller.mock".into(),
        buyer: "buyer.mock".into(),
    }
}

fn liquidity() -> LiquidityWindow {
    LiquidityWindow::new(
        LiquidityPolicy {
            per_quote_cap_xents: 5_000_000,
            per_window_cap_xents: 10_000_000,
            window_secs: 3600,
        },
        T0,
    )
}

const POLICY: ConfirmationPolicy = ConfirmationPolicy {
    required_confirmations: 12,
    timeout_secs: 900,
};

fn finish(scenario: &'static str, s: &Settlement) -> Transcript {
    let signed = sign_dev(s.receipt(T0 + 600)).expect("receipt signs");
    let receipt_verifies = verify_dev(&signed).is_ok();
    Transcript {
        banner: MOCK_BANNER,
        scenario,
        final_state: s.state,
        terminal: s.is_terminal(),
        open_obligation: s.has_open_obligation(),
        state_history: s.history.clone(),
        log: s.log.clone(),
        usdc_reserve: s.usdc_reserve,
        buyer_input: s.buyer_input,
        intents: s.intents.clone(),
        signed_receipt: signed,
        receipt_verifies,
    }
}

fn success(scenario: &'static str, asset: InputAsset) -> Transcript {
    let mut p = MockProviders::default();
    let mut lq = liquidity();
    let mut s = Settlement::new(format!("stl-{scenario}"), quote("q-ok", asset), nft()).unwrap();
    s.reserve_usdc("e1", &mut lq, T0).unwrap();
    s.authorize_input("e2", &mut p.input, 2_500, T0 + 5)
        .unwrap();
    s.route_xents("e3", &mut p.router, &mut lq, 2_510, T0 + 6)
        .unwrap();
    s.initiate_nft_transfer("e4", &mut p.nft, T0 + 7).unwrap();
    s.observe_confirmations("e5", &POLICY, 6, T0 + 60).unwrap();
    s.observe_confirmations("e6", &POLICY, 12, T0 + 150)
        .unwrap();
    s.release_usdc("e7", &mut p.payout, T0 + 151).unwrap();
    s.finalize("e8", T0 + 152).unwrap();
    finish(scenario, &s)
}

fn quote_expired() -> Transcript {
    let mut lq = liquidity();
    let mut s = Settlement::new("stl-expired", quote("q-exp", InputAsset::Card), nft()).unwrap();
    s.reserve_usdc("e1", &mut lq, T0).unwrap();
    s.tick("e2", T0 + 301).unwrap();
    finish("quote-expired", &s)
}

fn insufficient_liquidity() -> Transcript {
    let mut p = MockProviders::default();
    let mut lq = liquidity();
    let mut s = Settlement::new("stl-illiquid", quote("q-illq", InputAsset::Usdc), nft()).unwrap();
    s.reserve_usdc("e1", &mut lq, T0).unwrap();
    s.authorize_input("e2", &mut p.input, 2_500, T0 + 5)
        .unwrap();
    // Oracle moved: 2_580 > slippage ceiling 2_550 -> INSUFFICIENT_LIQUIDITY -> refund.
    s.route_xents("e3", &mut p.router, &mut lq, 2_580, T0 + 6)
        .unwrap();
    s.initiate_refund("e4", &mut p.input, T0 + 7).unwrap();
    s.complete_refund("e5", T0 + 8).unwrap();
    finish("insufficient-liquidity-refunded", &s)
}

fn nft_transfer_failed() -> Transcript {
    let mut p = MockProviders::default();
    let mut lq = liquidity();
    let mut s = Settlement::new("stl-nftfail", quote("q-nft", InputAsset::Crypto), nft()).unwrap();
    s.reserve_usdc("e1", &mut lq, T0).unwrap();
    s.authorize_input("e2", &mut p.input, 2_500, T0 + 5)
        .unwrap();
    s.route_xents("e3", &mut p.router, &mut lq, 2_500, T0 + 6)
        .unwrap();
    s.initiate_nft_transfer("e4", &mut p.nft, T0 + 7).unwrap();
    s.fail_nft_transfer("e5", "transfer reverted on native chain", T0 + 30)
        .unwrap();
    s.initiate_refund("e6", &mut p.input, T0 + 31).unwrap();
    s.complete_refund("e7", T0 + 32).unwrap();
    finish("nft-transfer-failed-refunded", &s)
}

fn usdc_payout_failed() -> Transcript {
    let mut p = MockProviders::default();
    let mut lq = liquidity();
    let mut s = Settlement::new("stl-payoutfail", quote("q-pay", InputAsset::Card), nft()).unwrap();
    s.reserve_usdc("e1", &mut lq, T0).unwrap();
    s.authorize_input("e2", &mut p.input, 2_500, T0 + 5)
        .unwrap();
    s.route_xents("e3", &mut p.router, &mut lq, 2_500, T0 + 6)
        .unwrap();
    s.initiate_nft_transfer("e4", &mut p.nft, T0 + 7).unwrap();
    s.observe_confirmations("e5", &POLICY, 12, T0 + 120)
        .unwrap();
    s.fail_usdc_payout("e6", "payout rail rejected transfer", T0 + 121)
        .unwrap();
    s.escalate(
        "e7",
        "NFT delivered; seller payout needs operator retry",
        T0 + 122,
    )
    .unwrap();
    finish("usdc-payout-failed-manual-review", &s)
}

#[derive(Serialize)]
struct VerificationTranscript {
    banner: &'static str,
    scenario: &'static str,
    key_id: &'static str,
    canonical_json: String,
    signature_hex: String,
    verify_original: bool,
    verify_tampered_amount: bool,
    verify_wrong_key: bool,
    replay_same_event_id: Applied,
    replay_conflicting_payload_rejected: bool,
}

fn receipt_verification() -> VerificationTranscript {
    let t = success("card-success", InputAsset::Card);
    let signed = t.signed_receipt;
    let mut tampered = signed.clone();
    tampered.receipt.usdc_reserve.released += 1;

    let mut p = MockProviders::default();
    let mut lq = liquidity();
    let mut s = Settlement::new("stl-replay", quote("q-rp", InputAsset::Card), nft()).unwrap();
    s.reserve_usdc("e1", &mut lq, T0).unwrap();
    s.authorize_input("e2", &mut p.input, 2_500, T0).unwrap();
    let replay = s.authorize_input("e2", &mut p.input, 2_500, T0).unwrap();
    let conflict = s.authorize_input("e2", &mut p.input, 2_600, T0);

    VerificationTranscript {
        banner: MOCK_BANNER,
        scenario: "signed-receipt-verification",
        key_id: DEV_RECEIPT_KEY_ID,
        canonical_json: signed.receipt.canonical_json().unwrap(),
        signature_hex: signed.signature_hex.clone(),
        verify_original: verify_dev(&signed).is_ok(),
        verify_tampered_amount: verify_dev(&tampered).is_ok(),
        verify_wrong_key: verify(&signed, DEV_RECEIPT_KEY_ID, b"not-the-key").is_ok(),
        replay_same_event_id: replay,
        replay_conflicting_payload_rejected: matches!(
            conflict,
            Err(SettlementError::ConflictingDuplicate { .. })
        ),
    }
}

fn emit<T: Serialize>(dir: &Path, name: &str, value: &T) {
    let json = serde_json::to_string_pretty(value).unwrap();
    println!("=== {name} ===\n{json}\n");
    fs::write(dir.join(format!("{name}.json")), format!("{json}\n")).unwrap();
}

fn main() {
    println!("{MOCK_BANNER}\n");
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("demo-transcripts");
    fs::create_dir_all(&dir).unwrap();

    emit(
        &dir,
        "01-card-success",
        &success("card-success", InputAsset::Card),
    );
    emit(
        &dir,
        "02-usdc-success",
        &success("usdc-success", InputAsset::Usdc),
    );
    emit(
        &dir,
        "03-crypto-success",
        &success("crypto-success", InputAsset::Crypto),
    );
    emit(&dir, "04-quote-expired", &quote_expired());
    emit(&dir, "05-insufficient-liquidity", &insufficient_liquidity());
    emit(
        &dir,
        "06-nft-transfer-failed-refunded",
        &nft_transfer_failed(),
    );
    emit(
        &dir,
        "07-usdc-payout-failed-manual-review",
        &usdc_payout_failed(),
    );
    emit(
        &dir,
        "08-signed-receipt-verification",
        &receipt_verification(),
    );

    println!("{MOCK_BANNER}");
}
