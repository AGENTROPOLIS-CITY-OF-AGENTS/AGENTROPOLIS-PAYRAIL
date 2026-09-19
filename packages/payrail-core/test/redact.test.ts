import { test } from "node:test";
import assert from "node:assert/strict";

import { redactSecrets, redactObject, containsSecret } from "../src/index.js";

// NOTE: the secret-shaped strings below are constructed at runtime so no real
// credential literal ever enters the source tree.

test("redactSecrets scrubs key=value patterns", () => {
  const out = redactSecrets("password=supersecret123");
  assert.ok(!out.includes("supersecret123"));
  assert.ok(out.includes("[REDACTED]"));
});

test("redactSecrets scrubs quoted token values", () => {
  const out = redactSecrets("token 'longsecretvalue123'");
  assert.ok(!out.includes("longsecretvalue123"));
  assert.ok(out.includes("[REDACTED]"));
});

test("redactSecrets scrubs bearer tokens", () => {
  const out = redactSecrets("Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456");
  assert.ok(!out.includes("abcdefghijklmnopqrstuvwxyz123456"));
  assert.ok(out.includes("[REDACTED]"));
});

test("redactSecrets scrubs sk- / ghp_ / AKIA key prefixes", () => {
  const sk = "sk-" + "abcdef1234567890";
  const ghp = "ghp_" + "abcdefghijklmnopqrstuvwxyz123456";
  const akia = "AKIA" + "ABCDEFGHIJKLMNOP";
  for (const secret of [sk, ghp, akia]) {
    const out = redactSecrets(`key=${secret}`);
    assert.ok(!out.includes(secret), `should redact ${secret.slice(0, 6)}`);
  }
});

test("redactSecrets scrubs RPC URLs with embedded credentials", () => {
  const out = redactSecrets("https://user:pass123@rpc.example.com");
  assert.ok(!out.includes("pass123"));
  assert.ok(out.includes("[REDACTED]@"));
});

test("redactSecrets scrubs private key blocks", () => {
  const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFA\n-----END PRIVATE KEY-----";
  const out = redactSecrets(pem);
  assert.ok(!out.includes("MIIEvQIBADANBgkqhkiG9w0BAQEFA"));
});

test("redactObject recursively scrubs nested objects", () => {
  const obj = {
    ok: "keep-me",
    nested: { rpcUrl: "https://user:pass@rpc.example.com", token: "Bearer abcdefghijklmnop" },
    list: ["password=supersecret123"],
  };
  const out = redactObject(obj);
  assert.equal(out.ok, "keep-me");
  assert.ok(!out.nested.rpcUrl.includes("pass"));
  assert.ok(!out.nested.token.includes("abcdefghijklmnop"));
  assert.ok(!out.list[0]!.includes("supersecret123"));
});

test("containsSecret detects secret-shaped content", () => {
  assert.ok(containsSecret("password=supersecret123"));
  assert.ok(containsSecret("Bearer abcdefghijklmnopqrstuvwxyz123456"));
  assert.ok(!containsSecret("just a normal log line"));
});
