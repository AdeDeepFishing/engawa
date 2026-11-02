/**
 * Applies supabase/migrations to the project's database without a CLI login.
 *
 * Builds the connection string from SUPABASE_URL and SUPABASE_PASSWORD in
 * .env.local and runs `supabase db push --db-url ...`. The direct host
 * (db.<ref>.supabase.co) is IPv6 only on new projects, so the session pooler
 * is used; override the host with SUPABASE_DB_HOST if the project lives in
 * another region. The password is never printed.
 */
import { spawnSync } from "node:child_process";

const url = process.env.SUPABASE_URL ?? "";
const password = process.env.SUPABASE_PASSWORD ?? "";
const host = process.env.SUPABASE_DB_HOST ?? "aws-0-ap-northeast-1.pooler.supabase.com";
const ref = url.replace(/^https?:\/\//, "").split(".")[0];

if (!ref || !password) {
  console.error("SUPABASE_URL and SUPABASE_PASSWORD must be set in .env.local");
  process.exit(2);
}

const encoded = encodeURIComponent(password);
const dbUrl = `postgresql://postgres.${ref}:${encoded}@${host}:5432/postgres`;
const extra = process.argv.slice(2);
const result = spawnSync("supabase", ["db", "push", "--db-url", dbUrl, ...extra], {
  encoding: "utf8",
  input: "y\n",
});
const redact = (s: string) => s.split(encoded).join("<password>").split(password).join("<password>");
process.stdout.write(redact(result.stdout ?? ""));
process.stderr.write(redact(result.stderr ?? ""));
process.exit(result.status ?? 1);
