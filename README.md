# Mana Portfolio

Static Magic collection dashboard for GitHub Pages. Collection: `ManaBox_Collection.csv`.

## Publish
1. Push this repository to `burnsj13/mana-portfolio` on `main`.
2. GitHub repository Settings → Pages → Build and deployment → Source → **GitHub Actions**.
3. Actions → **Update prices and deploy** → Run workflow. Check **backfill** for the first run to import available prices from October 6, 2026.
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
Open http://localhost:8765. The historical download is large and can take several minutes. Import it while October 6 remains inside the archive's retention window. Historical days are imported only when absent; twice-daily observations are preserved. Failed API requests fail the workflow before committing a current snapshot.

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
