# Supabase accounts and private collection data

Discord graph buttons now use a public Supabase function, with no GitHub token or sign-in required to send. See [Discord setup](supabase/DISCORD.md). Scheduled price checks send complete graph/change summaries at 7 AM and 7 PM America/New_York even when no alert threshold is met.

The app now requires Joe/Jacob sign-in, stores editable holdings and settings in Supabase, and saves future price archives in private Storage. **Complete [supabase/SETUP.md](supabase/SETUP.md) before deploying.** The sections below describe earlier CSV/GitHub storage behavior and historical data sources; Supabase setup takes precedence for current editing, privacy and archive retention. Previously public files remain in this repository/history.

# Mana Portfolio

Static Magic collection dashboard for GitHub Pages. Collection: `ManaBox_Collection.csv`.

## Publish
1. Push this repository to `burnsj13/mana-portfolio` on `main`.
2. GitHub repository Settings → Pages → Build and deployment → Source → **GitHub Actions**.
3. Actions → **Update prices and deploy** → Run workflow. Check **backfill** for the first run to import all available archived prices.
4. Open https://burnsj13.github.io/mana-portfolio/ after the deploy job succeeds.

The workflow runs at **10:17 and 22:17 UTC** daily (6:17 AM/PM New York during daylight saving; 5:17 AM/PM in standard time). GitHub schedules can be delayed and inactive public repositories may have schedules disabled after 60 days. The default branch must be main. The Actions token needs Contents write permission; repository/organization policies or branch protection may restrict it.

## Data
- Scryfall USD estimates for exact printing and finish; proxies excluded. Missing finish prices stay unpriced, never substituted.
- Both scheduled observations are retained in `data/history-index.json` and `data/history/YYYY-MM.json`; `data/latest.json` contains the published current collection and prices. The reload button reads these files; it does not request a new market update.
- Historical import uses MTGJSON's available 90-day archive, TCGplayer retail USD, and **today's collection quantities**. This is reconstructed value, not a record of what you owned on each day. Added dates are import dates and do not prove acquisition dates.
- Historical TCGplayer retail and current Scryfall prices may differ. Coverage and source are shown on chart hover. Missing dates are not fabricated; differing coverage or changing holdings can move totals independently of prices.
- These are indicative prices, without condition/language adjustments, fees, or sale guarantees.
- Publishing makes the collection, quantities, and purchase basis visible to visitors. Only index.html, app.js, styles.css, and data/ are included in the Pages artifact.

## Update collection
Replace `ManaBox_Collection.csv` with a fresh ManaBox export and push to main. The workflow rebuilds the public collection automatically. No browser imports or local storage are required. Export history backup downloads the published data.

## Local commands
Python 3.12+ (current updates have no third-party dependencies):
```
python scripts/update_prices.py
pip install ijson
python scripts/update_prices.py --backfill
python -m http.server 8765
```
Open http://localhost:8765. The historical download is large and can take several minutes. Import it while October 6 remains inside the archive's retention window. Missing historical days are imported; reconstructed historical observations are refreshed consistently; twice-daily observations are preserved. Failed API requests fail the workflow before committing a current snapshot.

The original server.py and START_WINDOWS.bat are retained as legacy local tools. The published dashboard does not need a running server.

If Scryfall returns an unavailable/rate-limit response, current updates fall back to MTGJSON TCGplayer retail. The dashboard displays the source and oldest price date used. The fallback archive normally refreshes daily, so two requests may observe identical prices. Source changes can produce discontinuities.


## Explorer and filtered history
Dropdowns filter by ManaBox binder, printed set, color, type, and per-card unit price. The table supports ascending/descending column sorting and pagination; search applies to table rows. Market-value and card-count graphs use the same dropdown filters. A price threshold is evaluated independently at each snapshot, so membership can change. Color/type matching uses metadata from MTGJSON (both faces combined) and is refreshed by successful Scryfall requests.

Snapshots now save compact per-entry data: [Scryfall ID, finish, quantity, binder, unit price]. Archived October data has been enriched with this detail. Older observations without detail remain on the whole-portfolio graph, but are explicitly omitted from filtered history. The latest observation can use the corresponding latest published per-card prices. Historical set and type matching uses the current printing metadata; unknown metadata is excluded only when that filter needs it.

Hover or tap the graph for an in-chart point, crosshair, date, and exact value. Keyboard left/right arrows inspect points. The chart uses actual elapsed dates and precise currency axis labels.


Hover, keyboard-focus, or tap a card name for an image and locally stored rules, mana cost, type, power/toughness, set, binder, and unit price. Multi-face cards show all available faces’ rules. Artwork loads from Scryfall’s image host; rules still work when the image is unavailable. Escape, the close button, or clicking outside dismisses the panel. `python scripts/update_prices.py --metadata-only` refreshes rules metadata without changing prices.


## Jacob’s separate collection
`jacob.html` reads only `data/jacob/`, generated from `Jacob_manabox.csv`. The original `index.html` continues reading the original collection’s files in `data/`. There are no cross-collection links or combined totals. The pages share CSS and JavaScript only. Both pages are publicly accessible on the same GitHub Pages site; separation is not authentication or private access.

The twice-daily workflow updates each collection separately. Commands for Jacob:
```
python scripts/update_prices.py --collection jacob
python scripts/update_prices.py --collection jacob --backfill --start-date 2024-10-19
```
The requested two-year history is unavailable from the free MTGJSON archive, which retains approximately 90 days. The initial import contains 87 available historical dates from July 21 through October 18, 2026, and a live October 19 snapshot. Missing earlier prices are not synthesized. History reconstructs current holdings and does not infer past ownership from CSV added dates.

The sortable **Change %** column on both pages compares the latest unit price to the exact printing and finish in that collection’s first saved snapshot. It never switches to a previous-day baseline. Missing, zero, or unavailable first prices show `—`; source changes can affect comparisons. New cards absent from the first snapshot have no percentage baseline. Purchase-basis dollar comparisons remain in their existing separate column.


## Long-term retention and storage
The provider’s rolling archive limits initial backfill, not retention of observations already saved here. Every collected snapshot is retained in monthly files, and the chart can browse a full year and beyond as data accumulates. There is no 90-day pruning.

Monthly files store shared holdings layouts once and each observation’s prices separately. At the initial collection sizes, two daily observations for both pages project to approximately 25 MB of additional published history a year (before compression). Growth depends on holdings, prices, and frequency; Git revision history also consumes repository space. The browser shares layouts in memory and expands card rows only when a filtered graph needs them. Historical backups now include `historyArchives` with compact monthly documents, plus the selected collection’s latest prices and metadata. Old aggregate-only observations remain intact.

The old monolithic history files were losslessly migrated into monthly archives. `load_history()` / `save_history()` in the updater decode and encode this format. The UI can still read a legacy history.json when no monthly index exists, to support migration.


The original collection’s backfill now imports every date available in the archive rather than stopping at October 6. Its first-snapshot percentage baseline follows the earliest retained date automatically. This extends the reconstructed value history of current holdings; it does not establish ownership on earlier dates. Running `python scripts/update_prices.py --backfill` uses this earliest-available behavior by default.


## Market moves, alerts, and wishlist
Both pages now show today’s matched-holdings price move in dollars and percent, per-card daily dollar/percent columns, and gainers/losers over today, a week, or a month. They compare the same printing and finish at current quantities, excluding proxies and missing baseline prices. Today means the latest observed date in America/New_York versus the last saved date before it, not a live exchange quote. The selected comparison date and sources are displayed. Mixed-source estimates are marked and excluded from notifications. Mini charts use the selected comparison period, with dashed amber segments for price-source changes. The original first-snapshot percentage column remains unchanged.

Each profile has a public `settings/main.json` or `settings/jacob.json`, containing alert thresholds and a wishlist of exact printing IDs and finishes. The page saves edits as browser-local drafts. **Draft changes are not background subscriptions**: copy/download the JSON, use the linked GitHub editor, and commit the profile settings file to main. The scheduled updater then requests wishlist prices and saves separate `data/[jacob/]wishlist/` history, without including wishlist cards in holdings or portfolio totals. Wishlist history begins when the entry is collected; matching-source earlier observations are needed before change alerts can fire. Removed entries stop being evaluated after the next update; their archived observations are retained. The wishlist supports up to 200 printings per profile.

Alert conditions require both the configured percentage and dollar-per-card thresholds and the selected direction. Defaults: 10%, $1, today, either direction. Missing/zero baselines, proxies, or source mismatches are excluded. Identical active conditions are sent once per comparison period and rule set, then rearm if they drop below the thresholds. An optional daily summary posts once per New York calendar day; disabling alerts also disables scheduled summaries. Both profiles remain separate, including destinations and notification state.

### Enable Discord delivery
1. In the destination Discord channel, open Edit Channel → Integrations → Webhooks and create/copy an incoming webhook URL.
2. In this GitHub repository, open Settings → Secrets and variables → Actions → New repository secret.
3. Set `DISCORD_WEBHOOK_MAIN` for the original collection, and/or `DISCORD_WEBHOOK_JACOB` for Jacob. The URL is the secret value. **Never commit the webhook URL in public settings or code.**
4. Push the code to main. In Actions → Update prices and deploy → Run workflow, select **Send graph summaries to configured Discord channels now** to test actual delivery. Keep backfill unchecked.

No Discord usernames are needed: the webhook posts to its configured channel. Recipients choose their own Discord channel notification settings. Alerts run with the twice-daily price checks (not continuous monitoring) and include a generated PNG with 90 days of portfolio history, latest estimated total, coverage, time, and source. Wishlist-triggered alerts still show the collection graph and explicitly exclude wishlist values from the total. Mentions are disabled in webhook payloads. Missing webhook secrets are reported on the website. Delivery failures do not suppress unsent alerts; they are reported in alert-status.json and do not prevent price-history commits or Pages publication. A remote-send/commit failure can still cause a duplicate on the next run; exact-once delivery cannot be guaranteed.

Background checks: `python scripts/check_alerts.py [--collection jacob]`. To render a graph without posting: `python scripts/check_alerts.py --dry-run --graph-output work/discord-preview.png`. Pillow is required for graph rendering and is installed by the workflow. `--send-summary` requests a manual graph summary even without a threshold event. Unit tests mock delivery; live delivery requires the private webhook secrets and a successful workflow run.

### Save wishlist changes directly from the website
The **Save directly to GitHub** button updates the selected collection’s tracked settings file and triggers the existing price/deployment workflow. No manual file editing or local git push is needed for wishlist edits. GitHub Pages itself is read-only, so saving requires your own short-lived fine-grained GitHub personal access token scoped to this repository with **Contents: Read and write**. The page’s connection panel links to GitHub’s token creation page. Tokens remain only in this tab’s memory, are sent only to the fixed api.github.com settings endpoint, and are never placed in public settings, URLs, browser storage, or commits. Disconnecting or refreshing clears the session. Do not share tokens with other users; each person saving needs authorized repository write access. Existing drafts and manual exports remain available. Remote file SHA checks prevent overwriting a file that changed after connection; reconnect and review on a conflict.

### Discord connection confirmation
The first enabled check with a configured webhook now sends one initial graph summary even if no card meets an alert threshold. Successful delivery records `confirmed` in that profile’s alert state, so subsequent ordinary pushes stay quiet unless an alert, daily summary, or manual graph request is due. A failed attempt is not marked confirmed and is retried later. Public alert status includes the reason when no message is sent. This changes the prior behavior where a normal push with zero events and daily summaries off produced no Discord message despite valid secrets.

### Profile-specific controls and trend labels
Jacob’s page no longer offers wishlist/watchlist controls, and the collector and alert checker ignore wishlist entries for Jacob. His collection trends, Discord alert settings, and **Send one-time Discord graph** control remain. The original collection retains the wishlist. Wishlist changes save to the profile’s settings file, are collected by the workflow, and reappear on subsequent page loads; uncollected draft entries are labeled accordingly.

Mini charts use the selected comparison period and the same baseline/current prices as the gain/loss figures. Dashed amber segments identify price-source changes, which are not verified market movement. Truly unchanged prices remain flat; unavailable comparisons leave the mini chart empty.

The one-time Discord button dispatches the existing workflow for only the selected profile’s manual summary. Its GitHub token additionally needs **Actions: Read and write** on this repository. **Contents: Read and write** remains necessary for saving wishlist/alert settings. The workflow still performs normal price checks for both profiles; normal alerts or due daily summaries may independently run for the other profile. The test is queued and can take several minutes; acceptance of a workflow request is not confirmation of Discord delivery.
