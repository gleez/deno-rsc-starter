type ClientIPHeaders = {
  cfConnectingIP?: string | null;
  trueClientIP?: string | null;
  xForwardedFor?: string | null;
  xRealIP?: string | null;
  forwarded?: string | null;
};

/**
 * Get the client's real IP address, with priority given to trusted proxy headers.
 * WARNING: Only safe when running behind a trusted reverse proxy (e.g., Cloudflare, Nginx).
 */
export const getClientIP = (
  req: Request,
  info: Deno.ServeHandlerInfo<Deno.Addr> | undefined,
): string => {
  const headers = req.headers;

  const ipHeaders: ClientIPHeaders = {
    cfConnectingIP: headers.get('CF-Connecting-IP'),
    trueClientIP: headers.get('True-Client-IP'),
    xForwardedFor: headers.get('X-Forwarded-For'),
    xRealIP: headers.get('X-Real-IP'),
    forwarded: headers.get('Forwarded'),
  };

  // 1. Cloudflare (most trusted)
  if (ipHeaders.cfConnectingIP) {
    return validateAndReturnIP(ipHeaders.cfConnectingIP);
  }

  // 2. Akamai
  if (ipHeaders.trueClientIP) {
    return validateAndReturnIP(ipHeaders.trueClientIP);
  }

  // 3. Common trusted proxies (Nginx, HAProxy)
  if (ipHeaders.xRealIP) {
    return validateAndReturnIP(ipHeaders.xRealIP);
  }

  // 4. X-Forwarded-For — only take first if trusted proxy
  if (ipHeaders.xForwardedFor) {
    const ips = ipHeaders.xForwardedFor
      .split(',')
      .map((ip) => ip.trim())
      .filter(isValidPublicIP); // Avoid spoofed internal IPs

    if (ips.length > 0) {
      return ips[0];
    }
  }

  // 5. Forwarded header (RFC 7239)
  if (ipHeaders.forwarded) {
    const forwardedIP = extractForwardedFor(ipHeaders.forwarded);
    if (forwardedIP && isValidPublicIP(forwardedIP)) {
      return forwardedIP;
    }
  }

  // 6. Fallback: remoteAddr from Deno
  const remoteAddr = info?.remoteAddr as Deno.NetAddr | undefined;
  if (remoteAddr?.hostname) {
    return remoteAddr.hostname;
  }

  return 'unknown';
};

/**
 * Basic IP validation — reject private/reserved ranges
 */
function isValidPublicIP(ip: string): boolean {
  // Remove port if present
  const cleanIP = ip.split(':')[0];

  // Reject common non-public ranges
  if (
    /^127\./.test(cleanIP) || // Loopback
    /^10\./.test(cleanIP) || // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIP) || // 172.16.0.0/12
    /^192\.168\./.test(cleanIP) || // 192.168.0.0/16
    /^::1$/.test(cleanIP) || // IPv6 loopback
    /^fd/.test(cleanIP) || // IPv6 unique local
    /^169\.254\./.test(cleanIP) // Link-local
  ) {
    return false;
  }

  return true;
}

function validateAndReturnIP(ip: string): string {
  const clean = ip.trim();
  return isValidPublicIP(clean) ? clean : 'unknown';
}

/**
 * Extract the first valid "for" parameter from Forwarded header
 */
function extractForwardedFor(header: string): string | null {
  const pairs = header.split(',').flatMap((part) => part.split(';'));

  for (const pair of pairs) {
    const [key, value] = pair.split('=').map((s) => s.trim());
    if (key.toLowerCase() === 'for') {
      const cleaned = value.replace(/^["\[]|["\]]$/g, '').split(':')[0]; // remove quotes, port
      if (isValidPublicIP(cleaned)) {
        return cleaned;
      }
    }
  }

  return null;
}
