# Public Discord graph button

Anyone may press the button, including visitors who are not signed in. On the
login page, separate buttons send Joe's or Jacob's graph to its configured channel.
The page's collection button sends that collection's graph. No GitHub token is
needed, and the browser never receives a Discord webhook or server secret.

The button sends the latest saved graph immediately. It does not collect new
prices. The message includes the total, last-24-hour matched price change in
dollars/percent, biggest gainer/loser, saved-check time and collection-page link.
The baseline is the most recent saved snapshot at or before 24 hours prior to the
latest price check. Its actual time is shown; no values are interpolated. If none
exists, the 24h comparison is unavailable. Gainers and losers use that same window.

## One-time activation

1. Run `migrations/202610190002_discord_button.sql` in Supabase SQL Editor. This
   adds an atomic 60-second cooldown per collection, shared by all callers.
2. In Supabase → Edge Functions → Secrets, add `DISCORD_WEBHOOK_MAIN` and
   `DISCORD_WEBHOOK_JACOB` with the respective private channel webhook URLs. These
   must be added separately from the existing GitHub Actions secrets. Do not put
   these URLs into code, browser fields or chat. `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are built-in Edge Function environment variables.
3. Create/deploy an Edge Function named **send-discord-summary**, using
   `functions/send-discord-summary/index.ts`. In its details/configuration,
   turn **Verify JWT with legacy secret** off. This function is intentionally
   public. All collection/database/Storage access policies remain protected.
   Alternatively, from the repo with an authenticated Supabase CLI:

   ```
   supabase functions deploy send-discord-summary --project-ref fqxcbuvhhgfcjlbeunmp --no-verify-jwt
   ```

4. Push the app changes and let **Update prices and deploy** complete once.
   Every price check prepares `discord-summary.json` and `discord-graph.png` in
   each collection's private Storage folder. Before that upload the button reports
   that the saved graph is not ready. Then test either public send button.

The endpoint accepts only `collection: "main"` or `collection: "jacob"`. It cannot
accept arbitrary message text or destinations. Responses do not expose stored
collection data, credentials, or upstream server errors. Discord mentions are
disabled. A cooldown applies even if delivery fails, to avoid rapid retries.

By design an anonymous caller can trigger delivery of either collection's saved
summary to that collection's Discord channel. No ownership or account restriction
is applied to sending. Viewing/editing collection data still requires sign-in.

## Automatic delivery

The existing GitHub Actions price workflow continues to host/update the app. It
runs at **7 AM and 7 PM America/New_York**, with summer/winter UTC pairs and a
timezone selector so only two daily price updates run. Scheduled jobs always send
both channels a full summary, even if alerts are disabled or no threshold is met.
Delivery happens after the update finishes; GitHub may queue scheduled jobs, so
messages are not guaranteed to arrive exactly at 7:00.

The public button is independent of GitHub Actions and uses its Supabase secrets.
Scheduled delivery still uses the existing GitHub repository webhook secrets.

Sources: [function configuration](https://supabase.com/docs/guides/functions/function-configuration),
[function secrets](https://supabase.com/docs/guides/functions/secrets).
