import express, { Request, Response, NextFunction } from "express";
import { PAYRAIL_VERSION, formatTimestamp, usdcMinorUnitString } from "@agentropolis/payrail-core";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "gateway-api",
    version: PAYRAIL_VERSION,
    timestamp: formatTimestamp(new Date()),
    dryRunDefault: true,
  });
});

// ---------------------------------------------------------------------------
// Pay endpoint — dry-run scaffold
// TODO: wire real wallet-guard policy evaluation here (Phase 1)
// TODO: wire real receipt-engine persistence here (Phase 1)
// TODO: wire real x402 settlement here (Phase 2) — NO raw keys accepted here
// ---------------------------------------------------------------------------
app.post("/pay", (req: Request, res: Response) => {
  const { agentId, districtId, taskId, amountMinorUnits, dryRun = true } = req.body as {
    agentId?: string;
    districtId?: string;
    taskId?: string;
    amountMinorUnits?: string;
    dryRun?: boolean;
  };

  if (!agentId || !districtId || !taskId || amountMinorUnits === undefined) {
    res.status(400).json({
      error: "Missing required fields: agentId, districtId, taskId, amountMinorUnits",
    });
    return;
  }

  let canonicalAmountMinorUnits: string;
  try {
    canonicalAmountMinorUnits = usdcMinorUnitString(amountMinorUnits);
  } catch {
    res.status(400).json({
      error: "amountMinorUnits must be a canonical non-negative integer string",
    });
    return;
  }

  if (dryRun !== true) {
    res.status(409).json({
      status: "BLOCKED",
      reason: "live-settlement-disabled",
      message: "Real settlement is not enabled. Use dryRun=true until the execution corridor is implemented and approved.",
      taskId,
      agentId,
      districtId,
      amountMinorUnits: canonicalAmountMinorUnits,
      receiptId: null,
      timestamp: formatTimestamp(new Date()),
    });
    return;
  }

  res.status(202).json({
    status: "SIMULATED",
    message: "Dry-run mode: no funds moved. Policy evaluation pending (Phase 1).",
    taskId,
    agentId,
    districtId,
    amountMinorUnits: canonicalAmountMinorUnits,
    receiptId: null,
    timestamp: formatTimestamp(new Date()),
  });
});

// ---------------------------------------------------------------------------
// Global error handler
// Express requires all four parameters for error-handling middleware, even
// if _next is unused. The underscore prefix suppresses the unused-variable warning.
// ---------------------------------------------------------------------------
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[gateway-api] Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`[gateway-api] AGENTROPOLIS-PAYRAIL gateway running on port ${PORT}`);
  console.log("[gateway-api] Dry-run mode ENABLED by default. No agent gets raw wallet power.");
});

export default app;
