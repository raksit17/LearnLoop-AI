const DEFAULT_PUBLIC_URL = "http://localhost:4318";
const loopbackHosts = new Set(["localhost", "127.0.0.1"]);

function loopbackHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && loopbackHosts.has(url.hostname);
  } catch {
    return false;
  }
}

/** Allow localhost/127.0.0.1 aliases on the SAME port, never arbitrary origins. */
export function matchesPublicOrigin(
  requestOrigin: string,
  publicUrl = process.env.PUBLIC_URL || DEFAULT_PUBLIC_URL,
): boolean {
  try {
    const request = new URL(requestOrigin);
    const configured = new URL(publicUrl);
    if (request.origin === configured.origin) return true;
    return (
      loopbackHttpOrigin(request.origin) &&
      loopbackHttpOrigin(configured.origin) &&
      request.port === configured.port
    );
  } catch {
    return false;
  }
}

/**
 * Demo bypass must be explicitly enabled and never works for a non-loopback
 * configured public URL. The compose web port is bound to 127.0.0.1.
 */
export function localDemoEnabled(
  enabled = process.env.DEV_AUTH_BYPASS,
  publicUrl = process.env.PUBLIC_URL || DEFAULT_PUBLIC_URL,
): boolean {
  if (enabled !== "true") return false;
  try {
    const url = new URL(publicUrl);
    return (
      loopbackHttpOrigin(url.origin) &&
      !url.username &&
      !url.password &&
      (url.pathname === "/" || url.pathname === "") &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
