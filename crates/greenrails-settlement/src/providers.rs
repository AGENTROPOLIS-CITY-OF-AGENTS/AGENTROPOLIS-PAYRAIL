//! Provider traits and MOCK implementations. Mocks only record intents.
//! No I/O, no network, no signatures, no funds.

use crate::quote::InputAsset;
use serde::{Deserialize, Serialize};

pub const MOCK_BANNER: &str = "MOCK SETTLEMENT · NO FUNDS WILL MOVE";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IntentKind {
    InputAuthorize,
    InputRefund,
    XentsRoute,
    NftTransfer,
    UsdcPayout,
}

/// A recorded intent. `reference` is deterministic and prefixed `mock-`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Intent {
    pub kind: IntentKind,
    pub reference: String,
    pub settlement_id: String,
    pub asset: String,
    pub amount_minor: u64,
    pub detail: String,
    pub mock: bool,
    pub banner: String,
}

fn intent(
    kind: IntentKind,
    prefix: &str,
    seq: &mut u64,
    settlement_id: &str,
    asset: &str,
    amount_minor: u64,
    detail: impl Into<String>,
) -> Intent {
    *seq += 1;
    Intent {
        kind,
        reference: format!("mock-{prefix}-{seq:04}"),
        settlement_id: settlement_id.to_string(),
        asset: asset.to_string(),
        amount_minor,
        detail: detail.into(),
        mock: true,
        banner: MOCK_BANNER.to_string(),
    }
}

/// Buyer input rail: card, USDC, or another supported crypto asset.
pub trait InputRail {
    fn authorize(&mut self, settlement_id: &str, asset: InputAsset, amount_minor: u64) -> Intent;
    fn refund(&mut self, settlement_id: &str, asset: InputAsset, amount_minor: u64) -> Intent;
}

/// Converts authorized input to exact-output $XENTS.
pub trait XentsRouter {
    fn route_exact_output(
        &mut self,
        settlement_id: &str,
        xents_out: u64,
        input_minor: u64,
    ) -> Intent;
}

/// Moves the Legacy NFT on its native chain (never burned, never bridged).
pub trait NftTransfer {
    fn transfer(&mut self, settlement_id: &str, chain: &str, token_ref: &str, to: &str) -> Intent;
}

/// Releases reserved USDC on Base to the seller.
pub trait UsdcPayout {
    fn payout(&mut self, settlement_id: &str, usdc_minor: u64, seller: &str) -> Intent;
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct MockInputRail {
    pub intents: Vec<Intent>,
    seq: u64,
}

impl InputRail for MockInputRail {
    fn authorize(&mut self, settlement_id: &str, asset: InputAsset, amount_minor: u64) -> Intent {
        let i = intent(
            IntentKind::InputAuthorize,
            "input-auth",
            &mut self.seq,
            settlement_id,
            &format!("{asset:?}").to_uppercase(),
            amount_minor,
            "authorize buyer input (recorded only)",
        );
        self.intents.push(i.clone());
        i
    }

    fn refund(&mut self, settlement_id: &str, asset: InputAsset, amount_minor: u64) -> Intent {
        let i = intent(
            IntentKind::InputRefund,
            "input-refund",
            &mut self.seq,
            settlement_id,
            &format!("{asset:?}").to_uppercase(),
            amount_minor,
            "compensating refund of buyer input (recorded only)",
        );
        self.intents.push(i.clone());
        i
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct MockXentsRouter {
    pub intents: Vec<Intent>,
    seq: u64,
}

impl XentsRouter for MockXentsRouter {
    fn route_exact_output(
        &mut self,
        settlement_id: &str,
        xents_out: u64,
        input_minor: u64,
    ) -> Intent {
        let i = intent(
            IntentKind::XentsRoute,
            "xents-route",
            &mut self.seq,
            settlement_id,
            "XENTS",
            xents_out,
            format!("exact-output route consuming {input_minor} input minor units (recorded only)"),
        );
        self.intents.push(i.clone());
        i
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct MockNftTransfer {
    pub intents: Vec<Intent>,
    seq: u64,
}

impl NftTransfer for MockNftTransfer {
    fn transfer(&mut self, settlement_id: &str, chain: &str, token_ref: &str, to: &str) -> Intent {
        let i = intent(
            IntentKind::NftTransfer,
            "nft-transfer",
            &mut self.seq,
            settlement_id,
            &format!("NFT:{chain}"),
            1,
            format!("transfer {token_ref} to {to} on native chain (recorded only)"),
        );
        self.intents.push(i.clone());
        i
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct MockUsdcPayout {
    pub intents: Vec<Intent>,
    seq: u64,
}

impl UsdcPayout for MockUsdcPayout {
    fn payout(&mut self, settlement_id: &str, usdc_minor: u64, seller: &str) -> Intent {
        let i = intent(
            IntentKind::UsdcPayout,
            "usdc-payout",
            &mut self.seq,
            settlement_id,
            "USDC:base",
            usdc_minor,
            format!("release reserved USDC to {seller} (recorded only)"),
        );
        self.intents.push(i.clone());
        i
    }
}

/// Bundle of mock providers used by the demo and tests.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct MockProviders {
    pub input: MockInputRail,
    pub router: MockXentsRouter,
    pub nft: MockNftTransfer,
    pub payout: MockUsdcPayout,
}
