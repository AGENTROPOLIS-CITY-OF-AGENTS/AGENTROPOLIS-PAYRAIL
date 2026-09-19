# Circle App Kit Provider Boundary

PAYRAIL may route approved operations to Circle App Kit.

## FISCALITH mapping

- SEND -> Send
- BRIDGE -> Bridge
- SWAP -> Swap
- UNIFIED_BALANCE -> Unified Balance
- ONRAMP -> Onramp
- EARN -> Earn

## Rules

- provider support is discovered dynamically when possible;
- application/custom fees are explicit financial semantics;
- estimate before execute when the provider supports estimates;
- signer credentials never enter agent prompts or receipts;
- raw-key provider adapters are not a production agent path;
- unsupported gas sponsorship is an explicit route constraint;
- provider errors preserve partial financial state for recovery;
- crosschain pending is not settlement;
- provider selection cannot bypass AEGIS or 54T.

## Certification

Material Circle App Kit adapter changes SHOULD be re-proven through AQUADUCT and consumed by the Forge before production eligibility changes.
