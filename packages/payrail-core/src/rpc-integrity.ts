// AGENTROPOLIS-PAYRAIL — RPC / provider integrity checks.

export interface RpcEndpoint {
  url: string;
  expectedChainId: number;
  /** Required non-empty allowlist of permitted hosts. */
  allowedHosts?: string[];
}

export interface RpcIntegrityResult {
  pass: boolean;
  problems: string[];
}

export function hasSupportedScheme(url: string): boolean {
  return /^https:\/\//i.test(url);
}

export function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function hasEmbeddedCredentials(url: string): boolean {
  try {
    const u = new URL(url);
    return Boolean(u.username) || Boolean(u.password);
  } catch {
    return false;
  }
}

export function isHostAllowed(host: string, allowedHosts: string[]): boolean {
  return allowedHosts.includes(host);
}

export function verifyRpcIntegrity(endpoint: RpcEndpoint): RpcIntegrityResult {
  const problems: string[] = [];

  if (!hasSupportedScheme(endpoint.url)) {
    problems.push(`RPC URL must use https: ${endpoint.url}`);
  }

  if (hasEmbeddedCredentials(endpoint.url)) {
    problems.push("RPC URL must not embed credentials (user:pass@host)");
  }

  const host = extractHost(endpoint.url);
  if (host === null) {
    problems.push(`RPC URL is not a valid URL: ${endpoint.url}`);
  }

  if (!Array.isArray(endpoint.allowedHosts) || endpoint.allowedHosts.length === 0) {
    problems.push("RPC host allowlist is required and must not be empty");
  } else if (host !== null && !isHostAllowed(host, endpoint.allowedHosts)) {
    problems.push(
      `RPC host "${host}" is not on the allowlist: ${endpoint.allowedHosts.join(", ")}`,
    );
  }

  if (!Number.isInteger(endpoint.expectedChainId) || endpoint.expectedChainId <= 0) {
    problems.push(`expectedChainId must be a positive integer: ${endpoint.expectedChainId}`);
  }

  return { pass: problems.length === 0, problems };
}

export function verifyChainId(
  reportedChainId: number,
  expectedChainId: number,
): RpcIntegrityResult {
  if (reportedChainId === expectedChainId) {
    return { pass: true, problems: [] };
  }
  return {
    pass: false,
    problems: [
      `chainId mismatch: RPC reported ${reportedChainId}, expected ${expectedChainId}`,
    ],
  };
}
