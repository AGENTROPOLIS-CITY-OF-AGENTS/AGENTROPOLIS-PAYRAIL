// AGENTROPOLIS-PAYRAIL — secret redaction

const KEY_VALUE_PATTERN =
  /\b(password|passwd|pwd|api[_-]?key|secret|token|private[_-]?key|seed|mnemonic|rpc[_-]?url|wallet[_-]?key)\b\s*[:=]\s*([^\s,;]+)/gi;
const QUOTED_VALUE_PATTERN =
  /\b(password|passwd|pwd|api[_-]?key|secret|token|private[_-]?key|seed|mnemonic)\s+(['"])([^'"]{6,})\2/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const KEY_PREFIX_PATTERN =
  /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{10,})/g;
const PEM_PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const RPC_CREDENTIAL_URL_PATTERN = /(https?:\/\/)[^/@\s]+:[^/@\s]+@/g;
const SENSITIVE_OBJECT_KEY_PATTERN =
  /^(password|passwd|pwd|api[_-]?key|secret|token|authorization|private[_-]?key|seed|mnemonic|rpc[_-]?(url|token|password)|wallet[_-]?(key|password))$/i;

const DETECTION_PATTERNS = [
  KEY_VALUE_PATTERN,
  QUOTED_VALUE_PATTERN,
  BEARER_PATTERN,
  KEY_PREFIX_PATTERN,
  PEM_PRIVATE_KEY_PATTERN,
  RPC_CREDENTIAL_URL_PATTERN,
] as const;

export function redactSecrets(input: string): string {
  if (!input) return input;

  let out = input;
  out = out.replace(QUOTED_VALUE_PATTERN, (_m, key: string, quote: string) => {
    return `${key} ${quote}[REDACTED]${quote}`;
  });
  out = out.replace(KEY_VALUE_PATTERN, (_m, key: string) => {
    return `${key}=[REDACTED]`;
  });
  out = out.replace(BEARER_PATTERN, "Bearer [REDACTED]");
  out = out.replace(KEY_PREFIX_PATTERN, "[REDACTED]");
  out = out.replace(PEM_PRIVATE_KEY_PATTERN, "[REDACTED PRIVATE KEY]");
  out = out.replace(RPC_CREDENTIAL_URL_PATTERN, "$1[REDACTED]@");
  return out;
}

export function redactObject<T>(value: T): T {
  if (typeof value === "string") {
    return redactSecrets(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactObject(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_OBJECT_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : redactObject(child);
    }
    return out as unknown as T;
  }
  return value;
}

function statelessTest(pattern: RegExp, input: string): boolean {
  pattern.lastIndex = 0;
  const matched = pattern.test(input);
  pattern.lastIndex = 0;
  return matched;
}

export function containsSecret(input: string): boolean {
  return DETECTION_PATTERNS.some((pattern) => statelessTest(pattern, input));
}
