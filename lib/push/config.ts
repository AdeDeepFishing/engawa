/**
 * The VAPID key pair that signs every push message, from the environment:
 * VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (base64url, as
 * `npx web-push generate-vapid-keys` prints them) and VAPID_SUBJECT (a
 * mailto: or https: contact the push services can reach). With any of the
 * three missing or malformed, push is "not configured": the key route
 * answers 404, the board hides "Get alerts", and nothing is sent or stored.
 * Server only; the browser gets the public key from /api/b/[slug]/push/key.
 */
export interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let warned = false;

function bytes(value: string): number {
  return /^[A-Za-z0-9_-]+={0,2}$/.test(value) ? Buffer.from(value, "base64url").length : 0;
}

export function vapid(): Vapid | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";
  if (!publicKey && !privateKey && !subject) return null;
  const valid = bytes(publicKey) === 65 && bytes(privateKey) === 32 && /^(mailto:|https:\/\/)\S+$/.test(subject);
  if (!valid) {
    if (!warned) {
      warned = true;
      // Names only: never a value.
      console.warn("push: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT is missing or malformed, push stays off");
    }
    return null;
  }
  return { publicKey, privateKey, subject };
}
