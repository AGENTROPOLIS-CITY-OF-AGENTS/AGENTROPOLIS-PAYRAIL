import { test } from "node:test";
import assert from "node:assert/strict";

import {
  verifyRpcIntegrity,
  verifyChainId,
  hasSupportedScheme,
  hasEmbeddedCredentials,
  extractHost,
  isHostAllowed,
} from "../src/index.js";

test("verifyRpcIntegrity passes a clean allowlisted https endpoint", () => {
  const result = verifyRpcIntegrity({
    url: "https://rpc.mainnet.arc.io",
    expectedChainId: 5042,
    allowedHosts: ["rpc.mainnet.arc.io"],
  });
  assert.equal(result.pass, true);
  assert.deepEqual(result.problems, []);
});

test("verifyRpcIntegrity fails closed on a non-https URL", () => {
  const result = verifyRpcIntegrity({
    url: "http://rpc.mainnet.arc.io",
    expectedChainId: 5042,
    allowedHosts: ["rpc.mainnet.arc.io"],
  });
  assert.equal(result.pass, false);
  assert.ok(result.problems.some((p) => p.includes("https")));
});

test("verifyRpcIntegrity fails closed on embedded credentials", () => {
  const result = verifyRpcIntegrity({
    url: "https://user:pass@rpc.mainnet.arc.io",
    expectedChainId: 5042,
    allowedHosts: ["rpc.mainnet.arc.io"],
  });
  assert.equal(result.pass, false);
  assert.ok(result.problems.some((p) => p.includes("credentials")));
});

test("verifyRpcIntegrity fails closed on a host not on the allowlist", () => {
  const result = verifyRpcIntegrity({
    url: "https://evil.example.com",
    expectedChainId: 5042,
    allowedHosts: ["rpc.mainnet.arc.io"],
  });
  assert.equal(result.pass, false);
  assert.ok(result.problems.some((p) => p.includes("allowlist")));
});

test("verifyRpcIntegrity fails closed on an invalid expectedChainId", () => {
  const result = verifyRpcIntegrity({
    url: "https://rpc.mainnet.arc.io",
    expectedChainId: 0,
    allowedHosts: ["rpc.mainnet.arc.io"],
  });
  assert.equal(result.pass, false);
});

test("verifyChainId detects a mismatch", () => {
  assert.equal(verifyChainId(5042, 5042).pass, true);
  const mismatch = verifyChainId(1, 5042);
  assert.equal(mismatch.pass, false);
  assert.ok(mismatch.problems[0]!.includes("chainId mismatch"));
});

test("helpers behave correctly", () => {
  assert.ok(hasSupportedScheme("https://x.io"));
  assert.ok(!hasSupportedScheme("http://x.io"));
  assert.ok(hasEmbeddedCredentials("https://u:p@x.io"));
  assert.ok(!hasEmbeddedCredentials("https://x.io"));
  assert.equal(extractHost("https://rpc.mainnet.arc.io"), "rpc.mainnet.arc.io");
  assert.ok(isHostAllowed("rpc.mainnet.arc.io", ["rpc.mainnet.arc.io"]));
  assert.ok(!isHostAllowed("evil.io", ["rpc.mainnet.arc.io"]));
});

test("verifyRpcIntegrity fails closed when allowlist is missing or empty", () => {
  const missing = verifyRpcIntegrity({
    url: "https://rpc.mainnet.arc.io",
    expectedChainId: 5042,
  });
  assert.equal(missing.pass, false);
  assert.ok(missing.problems.some((p) => p.includes("allowlist")));

  const empty = verifyRpcIntegrity({
    url: "https://rpc.mainnet.arc.io",
    expectedChainId: 5042,
    allowedHosts: [],
  });
  assert.equal(empty.pass, false);
  assert.ok(empty.problems.some((p) => p.includes("allowlist")));
});
