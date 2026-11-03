/**
 * A UUID in its canonical text form, any case: the shape of every card,
 * submission and board id in the database, and of the device id the browser
 * makes with crypto.randomUUID(). Checked before an id from a URL or a body
 * reaches a query, so a malformed one answers 400 or 404 instead of a
 * database error.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
