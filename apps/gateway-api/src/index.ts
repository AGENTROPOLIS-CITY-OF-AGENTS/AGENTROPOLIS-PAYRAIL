import express, { type Express, Request, Response, NextFunction } from "express";
import {
  PAYRAIL_VERSION,
  formatTimestamp,
  formatUsdc,
  parseUsdc,
} from "@agentropolis/payrail-core";

const app: Express = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "gateway-api",
    version: PAYRAIL_VERSION,
    timestamp: formatTimestamp(new Date()),
    dryRunDefault: true,
  });
});

app.post("/pay", (req: Request, res: Response) => {
  const { agentId, districtId, taskId, amountUsdc, dryRun = true } = req.body as {
    agentId?: string;
    districtId?: string;
    taskId?: string;
    amountUsdc?: string;
    dryRun?: boolean;
  };

  if (!agentId || !districtId || !taskId || amountUsdc === undefined) {
    res.status(400).json({
      error: "Missing required fields: agentId, districtId, taskId, amountUsdc",
    });
    return;
  }

  let exactAmount;
  try {
    exactAmount = parseUsdc(amountUsdc);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid USDC amount",
    });
    return;
  }

  res.status(202).json({
    status: dryRun ? "dry-run-accepted" : "pending",
    message: dryRun
      ? "Dry-run mode: no funds moved. Policy evaluation pending."
      : "Real settlement not yet implemented. Enable dry-run mode.",
    taskId,
    agentId,
    districtId,
    amountUsdc: formatUsdc(exactAmount),
    receiptId: null,
    timestamp: formatTimestamp(new Date()),
  });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[gateway-api] Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`[gateway-api] AGENTROPOLIS-PAYRAIL gateway running on port ${PORT}`);
  console.log("[gateway-api] Dry-run mode ENABLED by default. No agent gets raw wallet power.");
});

export default app;
