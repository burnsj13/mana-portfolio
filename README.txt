MANA PORTFOLIO - WINDOWS PC

1. Extract this ZIP into a normal folder on your PC.
2. Install Python 3 if you don't already have it.
3. Double-click START_WINDOWS.bat. Keep the terminal window open.
4. Open http://localhost:8765 in Chrome or Edge (it may open automatically).
5. Click Import ManaBox CSV and choose ManaBox_Collection.csv (included).
6. Click Update market prices. Progress and diagnostic logs are shown in the dashboard.

This version sends requests through a LOCAL Python server to Scryfall. This avoids
browser restrictions on direct Scryfall requests from file:// HTML pages.
Internet access is needed for prices; the CSV stays on your PC.

Price history is saved in the browser's local storage on this PC/browser only.
Click Export history backup periodically to save a copy. Price history starts
when you first refresh; no historic collection values are invented.

If prices fail, expand Diagnostics / error log and copy the text.
The local server runs only on 127.0.0.1, not your LAN or public internet.
