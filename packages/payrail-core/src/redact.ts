// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — payrail-core / redact
//
// Secret redaction for logs, receipts, and error messages.
//
// PAYRAIL must never leak wallet keys, RPC tokens, seed phrases, bearer
// tokens, or other credentials into logs, receipts, or agent-visible output.
// redactSecrets() scrubs these patterns from any string; redactObject() applies
// it recursively to object values.
//
// NOTE: regex pattern DEFINITIONS below legitimately contain secret-shaped
// substrings (sk-, ghp_, AKIA, -----BEGIN, Bearer). These are pattern
// definitions, not real secrets.
// ---------------------------------------------------------------------------

// Key=value / key: value patterns (e.g. password=..., token: ...)
const KEY_VALUE_PATTERN =
  /\b(password|passwd|pwd|api[_-]?key|secret|token|private[_-]?key|seed|mnemonic|rpc[_-]?url|wallet[_-]?key)\b\s*[:=]\s*([^\s,;]+)/gi;

// Quoted-value patterns (e.g. token 'longvalue', password "longvalue")
const QUOTED_VALUE_PATTERN =
  /\b(password|passwd|pwd|api[_-]?key|secret|token|private[_-]?key|seed|mnemonic)\s+(['"])([^'"]{6,})\2/gi;

// Bearer tokens
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

// Common API key / secret prefixes
const KEY_PREFIX_PATTERN =
  /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{10,})/g;

// PEM private key blocks (header + base64 body + footer)
const PEM_PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

// RPC URLs that embed credentials (https://user:pass@host)
const RPC_CREDENTIAL_URL_PATTERN = /(https?:\/\/)[^/@\s]+:[^/@\s]+@/g;

/** Redact secret-shaped substrings from a string. */
export function redactSecrets(input: string): string {
  if (!input) return input;

  let out = input;

  // Quoted-value patterns first (keep the key AND the quotes).
  out = out.replace(QUOTED_VALUE_PATTERN, (_m, key: string, quote: string) => {
    return `${key} ${quote}[REDACTED]${quote}`;
  });

  // Key=value / key: value patterns.
  out = out.replace(KEY_VALUE_PATTERN, (_m, key: string) => {
    return `${key}=[REDACTED]`;
  });

  // Bearer tokens.
  out = out.replace(BEARER_PATTERN, "Bearer [REDACTED]");

  // Known key prefixes.
  out = out.replace(KEY_PREFIX_PATTERN, "[REDACTED]");

  // PEM private key blocks.
  out = out.replace(PEM_PRIVATE_KEY_PATTERN, "[REDACTED PRIVATE KEY]");

  // RPC URLs with embedded credentials.
  out = out.replace(RPC_CREDENTIAL_URL_PATTERN, "$1[REDACTED]@");

  return out;
}

/** Recursively redact secret-shaped values in an object (returns a new object). */
export function redactObject<T>(value: T): T {
  if (typeof value === "string") {
    return redactSecrets(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactObject(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactObject(v);
    }
    return out as unknown as T;
  }
  return value;
}

/** True if a string contains any secret-shaped content (for tests / guards). */
export function containsSecret(input: string): boolean {
  return (
    KEY_VALUE_PATTERN.test(input) ||
    QUOTED_VALUE_PATTERN.test(input) ||
    BEARER_PATTERN.test(input) ||
    KEY_PREFIX_PATTERN.test(input) ||
    PEM_PRIVATE_KEY_PATTERN.test(input) ||
    RPC_CREDENTIAL_URL_PATTERN.test(input)
  );
}
