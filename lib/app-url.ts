import { headers } from "next/headers";

const WEB_PROTOCOLS = new Set(["http:", "https:"]);

let warned = false;

/**
 * Parses NEXT_PUBLIC_APP_URL. Returns null when the value is missing,
 * unparsable or not http(s). A typo such as "ttps://example.com" still parses
 * as a URL with an unknown scheme, and without this check it would end up in
 * every share link, OG tag and QR code. Exported for the eval script.
 */
export function configuredAppBase(raw: string | undefined = process.env.NEXT_PUBLIC_APP_URL): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (WEB_PROTOCOLS.has(url.protocol)) return url;
  } catch {
    // not a URL at all: handled below
  }
  if (!warned) {
    warned = true;
    console.warn(`NEXT_PUBLIC_APP_URL is not an http(s) URL, using the request host instead: ${JSON.stringify(raw)}`);
  }
  return null;
}

/**
 * Absolute base for share links, the OG image and the poster QR: the
 * configured URL when it is valid, else this request's host.
 */
export async function appBase(): Promise<URL> {
  const configured = configuredAppBase();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return new URL(`${proto}://${host}`);
}
