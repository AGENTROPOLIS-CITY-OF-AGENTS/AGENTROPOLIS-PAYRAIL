# greenrails-mock-demo

Static, dependency-free MOCK walkthrough of the GREENRAILS settlement state machine
(GREENRAILS × $XENTS × HOOD TERPS). Every screen shows `MOCK SETTLEMENT · NO FUNDS WILL MOVE`.

- No wallet, RPC, or payment API is called. No wallet-connect libraries. No runtime dependencies.
- `LIVE_FUNDS_ENABLED = false as const` (`src/states.ts`), asserted by tests.
- Engine (`src/engine.ts`) enforces: reserve-before-accept, dual-verify-before-complete,
  quote expiry, liquidity/slippage caps, idempotent event ids, and the canonical transition table.
- Receipt (`src/receipt.ts`) carries a labelled mock signature (FNV-1a over canonical JSON; not cryptographic).

This is a demo surface intended to be ported into the canonical GREENRAILS UI, not a replacement for it.

```sh
pnpm --filter @agentropolis/greenrails-mock-demo test   # build + node:test
pnpm --filter @agentropolis/greenrails-mock-demo serve  # http://localhost:4173
```

Demonstration only. No financial product is offered.
