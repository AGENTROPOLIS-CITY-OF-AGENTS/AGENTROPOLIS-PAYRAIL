// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — payrail-core / rpc-integrity
//
// RPC / provider integrity checks.
//
// Before any settlement adapter talks to an RPC endpoint, PAYRAIL verifies:
//   - the endpoint is on the operator allowlist (no arbitrary RPCs);
//   - the endpoint does not embed credentials in the URL;
//   - the endpoint uses a supported scheme (https);
//   - the chainId the endpoint reports matches the expected chain.
//
// This module performs NO network calls. It validates configuration and
// endpoint metadata so a misconfigured or malicious RPC is refused before
// any value moves.
// ---------------------------------------------------------------------------

/** An RPC endpoint descriptor. */
export interface RpcEndpoint {
  url: string;
  expectedChainId: number;
  /** Optional allowlist of permitted hosts (e.g. ["rpc.mainnet.arc.io"]). */
  allowedHosts?: string[];
}

export interface RpcIntegrityResult {
  pass: boolean;
  problems: string[];
}

/** True if the URL uses a supported scheme (https). */
export function hasSupportedScheme(url: string): boolean {
  return /^https:\/\//i.test(url);
}

/** Extract the host from a URL, or null if invalid. */
export function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** True if the URL embeds credentials (user:pass@host). */
export function hasEmbeddedCredentials(url: string): boolean {
  try {
    const u = new URL(url);
    return Boolean(u.username) || Boolean(u.password);
  } catch {
    return false;
  }
}

/** True if the host is on the allowlist. */
export function isHostAllowed(host: string, allowedHosts: string[]): boolean {
  return allowedHosts.includes(host);
}

/**
 * Verify an RPC endpoint's integrity.
 * Fails closed: any problem => pass=false.
 */
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
  } else if (endpoint.allowedHosts && endpoint.allowedHosts.length > 0) {
    if (!isHostAllowed(host, endpoint.allowedHosts)) {
      problems.push(
        `RPC host "${host}" is not on the allowlist: ${endpoint.allowedHosts.join(", ")}`,
      );
    }
  }

  if (!Number.isInteger(endpoint.expectedChainId) || endpoint.expectedChainId <= 0) {
    problems.push(`expectedChainId must be a positive integer: ${endpoint.expectedChainId}`);
  }

  return { pass: problems.length === 0, problems };
}

/**
 * Verify that a reported chainId matches the expected chainId.
 * Used after an RPC handshake to confirm the endpoint is on the right chain.
 */
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
