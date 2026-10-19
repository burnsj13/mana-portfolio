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
- Both scheduled observations are retained in `data/history.json`; `data/latest.json` contains the published current collection and prices. The reload button reads these files; it does not request a new market update.
- Historical import uses MTGJSON's available 90-day archive, TCGplayer retail USD, and **today's collection quantities**. This is reconstructed value, not a record of what you owned on each day. Added dates are import dates and do not prove acquisition dates.
- Historical TCGplayer retail and current Scryfall prices may differ. Coverage and source are shown on chart hover. Missing dates are not fabricated; differing coverage or changing holdings can move totals independently of prices.
- These are indicative prices, without condition/language adjustments, fees, or sale guarantees.
- Publishing makes the collection, quantities, and purchase basis visible to visitors. Only index.html and data/ are included in the Pages artifact.

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
