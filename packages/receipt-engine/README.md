# receipt-engine

Creates auditable AGENTROPOLIS-PAYRAIL receipts.

Receipt money is encoded as `amountMinorUnits`, a canonical unsigned integer string representing 6-decimal ERC-20 USDC minor units.

Example:

```ts
import { usdcMinorUnitString } from "@agentropolis/payrail-core";
import { createReceipt } from "@agentropolis/receipt-engine";

const receipt = createReceipt({
  taskId: "task_abc123" as never,
  agentId: "whale-watcher-54" as never,
  districtId: "harbor" as never,
  taskType: "whale-alert",
  description: "Wallet threshold alert",
  amountMinorUnits: usdcMinorUnitString("10000"),
  status: "SIMULATED",
  dryRun: true,
});
```

No receipt uses floating-point money.
