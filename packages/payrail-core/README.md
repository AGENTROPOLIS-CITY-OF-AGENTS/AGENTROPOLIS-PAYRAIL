# payrail-core

> Shared types, utilities, and constants for AGENTROPOLIS-PAYRAIL.

## Money law

All settlement money is integer-safe.

- ERC-20 USDC uses 6-decimal minor units.
- Arc native USDC uses 18-decimal minor units.
- JSON/API boundaries use canonical unsigned integer strings because JSON cannot encode bigint.
- Floating-point money is not accepted by the payment domain.

Example:

```ts
import {
  usdcMinorUnitString,
  formatUsdcMinorUnitString,
} from "@agentropolis/payrail-core";

const amount = usdcMinorUnitString("50000"); // 0.05 USDC
console.log(formatUsdcMinorUnitString(amount)); // "0.050000"
```

The 6-decimal ERC-20 and 18-decimal Arc-native representations are distinct and require explicit conversion.
