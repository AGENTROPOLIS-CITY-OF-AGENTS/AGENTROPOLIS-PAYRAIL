import type { ExecutedSettlement } from "@agentropolis/payrail-core";
import type { SimulatedSettlement } from "./shared";

declare const simulated: SimulatedSettlement;

// Compile-time gate: a simulated result must never be accepted as execution.
// @ts-expect-error simulated outcomes are intentionally not ExecutedSettlement
const mustFail: ExecutedSettlement = simulated;

void mustFail;
