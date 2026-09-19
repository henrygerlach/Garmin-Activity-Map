import "./env.js";

import { saveWahooRefreshToken } from "./persist.js";
import { authorizeUrl, exchangeAuthorizationCode } from "./wahoo.js";

/**
 * One-off Wahoo authorisation, run by hand, once per person who wants power
 * data — each family member connects their own Wahoo account to their own
 * Supabase account.
 *
 * Deliberately not a callback route on the sync backend. This is granted once
 * and then refreshed forever after, so a whole OAuth redirect endpoint —
 * public URL, state parameter, a server that has to be running at the moment
 * the browser comes back — would be scaffolding for something that happens
 * again only if the token is revoked. Copying the code out of the address bar
 * costs one paste and no code.
 *
 *   npm run wahoo:auth -- <user-id>            prints the consent URL
 *   npm run wahoo:auth -- <user-id> <code>     exchanges the code and stores the token
 *
 * `<user-id>` is the Supabase account's id, from Studio > Authentication.
 */
async function main() {
  const clientId = process.env.WAHOO_CLIENT_ID;
  const clientSecret = process.env.WAHOO_CLIENT_SECRET;
  const redirectUri = process.env.WAHOO_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing WAHOO_CLIENT_ID / WAHOO_CLIENT_SECRET / WAHOO_REDIRECT_URI in .env");
  }

  const userId = process.argv[2];
  if (!userId) throw new Error("Usage: npm run wahoo:auth -- <user-id> [code]");

  const code = process.argv[3];
  if (!code) {
    console.log("Open this in a browser and approve access:\n");
    console.log(`  ${authorizeUrl(clientId, redirectUri)}\n`);
    console.log(`Wahoo then redirects to ${redirectUri}?code=<code>. That page will not load —`);
    console.log("it doesn't have to. Copy the code out of the address bar and run:\n");
    console.log(`  npm run wahoo:auth -- ${userId} <code>`);
    return;
  }

  const { refreshToken } = await exchangeAuthorizationCode(clientId, clientSecret, redirectUri, code);
  await saveWahooRefreshToken(userId, refreshToken);
  console.log("Refresh token stored. The Sync button will pick up power from now on.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
