/**
 * engawa-shibuya-portal: a cron Worker (every 5 minutes, wrangler.toml) that
 * posts each new broadcast of the 渋谷区防災ポータル 防災行政無線 feed into the
 * shibuya board's official inbox. The logic is in src/run.ts and src/feed.ts;
 * README.md has the deploy steps.
 */
import { runOnce } from "./run";

interface Env {
  STATE: KVNamespace;
  ENGAWA_INBOX_URL: string;
  PORTAL_SENDER: string;
  /** Set with `wrangler secret put ENGAWA_INBOX_SECRET`, never in wrangler.toml. */
  ENGAWA_INBOX_SECRET?: string;
}

export default {
  async scheduled(_controller, env, _ctx) {
    await runOnce({
      fetch: (input, init) => fetch(input, init),
      store: {
        get: (key) => env.STATE.get(key),
        put: (key, value, options) => env.STATE.put(key, value, options),
        delete: (key) => env.STATE.delete(key),
      },
      inboxUrl: env.ENGAWA_INBOX_URL,
      inboxSecret: env.ENGAWA_INBOX_SECRET,
      sender: env.PORTAL_SENDER,
    });
  },
} satisfies ExportedHandler<Env>;
