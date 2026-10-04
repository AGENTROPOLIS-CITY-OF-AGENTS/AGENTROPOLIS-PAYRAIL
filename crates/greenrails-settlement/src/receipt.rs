//! Signed MOCK receipts. HMAC-SHA256 over canonical JSON (sorted keys, no
//! whitespace). The dev key below is public and for MOCK use only; production
//! receipt keys live in a sealed signer and are never present in this crate.

use crate::ledger::{BuyerInput, UsdcReserve};
use crate::providers::{Intent, MOCK_BANNER};
use crate::state::SettlementState;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::fmt;

pub const DEV_RECEIPT_KEY_ID: &str = "greenrails-mock-dev-key-v1";
pub const DEV_RECEIPT_KEY: &[u8] = b"GREENRAILS-MOCK-DEV-KEY-DO-NOT-USE-IN-PRODUCTION";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Receipt {
    pub banner: String,
    pub mock: bool,
    pub settlement_id: String,
    pub quote_id: String,
    pub final_state: SettlementState,
    pub state_history: Vec<SettlementState>,
    pub nft_transfer_confirmed: bool,
    pub usdc_released: bool,
    pub usdc_reserve: UsdcReserve,
    pub buyer_input: BuyerInput,
    pub intents: Vec<Intent>,
    pub issued_at: u64,
}

impl Receipt {
    pub fn canonical_json(&self) -> Result<String, ReceiptError> {
        canonical_json(self)
    }
}

/// Serialize via `serde_json::Value` so object keys are sorted (BTreeMap).
pub fn canonical_json<T: Serialize>(value: &T) -> Result<String, ReceiptError> {
    let v = serde_json::to_value(value).map_err(|_| ReceiptError::Serialization)?;
    serde_json::to_string(&v).map_err(|_| ReceiptError::Serialization)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReceiptError {
    Serialization,
    MissingBanner,
    NotMock,
    BadSignature,
    UnknownKey,
    FinalizedWithoutBothLegs,
}

impl fmt::Display for ReceiptError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}

impl std::error::Error for ReceiptError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SignedReceipt {
    pub receipt: Receipt,
    pub key_id: String,
    pub algorithm: String,
    pub signature_hex: String,
}

type HmacSha256 = Hmac<Sha256>;

fn mac(key: &[u8], msg: &[u8]) -> Vec<u8> {
    let mut m = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
    m.update(msg);
    m.finalize().into_bytes().to_vec()
}

pub fn sign(receipt: Receipt, key_id: &str, key: &[u8]) -> Result<SignedReceipt, ReceiptError> {
    if receipt.banner != MOCK_BANNER {
        return Err(ReceiptError::MissingBanner);
    }
    if !receipt.mock {
        return Err(ReceiptError::NotMock);
    }
    if receipt.final_state == SettlementState::ReceiptFinalized
        && !(receipt.nft_transfer_confirmed && receipt.usdc_released)
    {
        return Err(ReceiptError::FinalizedWithoutBothLegs);
    }
    let canonical = receipt.canonical_json()?;
    let sig = mac(key, canonical.as_bytes());
    Ok(SignedReceipt {
        receipt,
        key_id: key_id.to_string(),
        algorithm: "HMAC-SHA256/canonical-json".to_string(),
        signature_hex: hex::encode(sig),
    })
}

pub fn sign_dev(receipt: Receipt) -> Result<SignedReceipt, ReceiptError> {
    sign(receipt, DEV_RECEIPT_KEY_ID, DEV_RECEIPT_KEY)
}

/// Constant-time verification via `Mac::verify_slice`.
pub fn verify(signed: &SignedReceipt, key_id: &str, key: &[u8]) -> Result<(), ReceiptError> {
    if signed.key_id != key_id {
        return Err(ReceiptError::UnknownKey);
    }
    if signed.receipt.banner != MOCK_BANNER {
        return Err(ReceiptError::MissingBanner);
    }
    if signed.receipt.final_state == SettlementState::ReceiptFinalized
        && !(signed.receipt.nft_transfer_confirmed && signed.receipt.usdc_released)
    {
        return Err(ReceiptError::FinalizedWithoutBothLegs);
    }
    let canonical = signed.receipt.canonical_json()?;
    let sig = hex::decode(&signed.signature_hex).map_err(|_| ReceiptError::BadSignature)?;
    let mut m = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
    m.update(canonical.as_bytes());
    m.verify_slice(&sig).map_err(|_| ReceiptError::BadSignature)
}

pub fn verify_dev(signed: &SignedReceipt) -> Result<(), ReceiptError> {
    verify(signed, DEV_RECEIPT_KEY_ID, DEV_RECEIPT_KEY)
}
