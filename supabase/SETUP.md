# Supabase setup

The website accepts usernames **Joe** and **Jacob**, each with a password. Both
accounts can view both collections. Only a collection's assigned owner can edit
its holdings, wishlist or alert settings. Account identifiers are internal
placeholder emails; personal emails and email delivery are not required.

## Activate the project

1. In Supabase SQL Editor, run `migrations/202610190001_portfolio.sql` once. If
   your GitHub integration has already applied this migration, skip this step.
2. In Authentication → Users → Add user → Create new user, create
   `joe@mana-portfolio.invalid` and `jacob@mana-portfolio.invalid`. Set passwords
   privately, and enable **Auto Confirm User**. Keep public sign-ups disabled in
   Authentication settings. Account recovery uses an administrator password reset;
   these placeholder addresses cannot receive reset emails. Never send passwords
   through chat or commit them to GitHub.
3. Run `assign-owners.sql` in SQL Editor. It checks both accounts exist and assigns
   Joe to `main`, Jacob to `jacob`. Creating any other Auth account grants no access.
4. In GitHub repository Settings → Secrets and variables → Actions, add
   `SUPABASE_SERVICE_ROLE_KEY`. Its value is a Supabase server **Secret key**
   (`sb_secret_…`) or the legacy **service_role** key. This powerful key stays in
   GitHub Actions, never in browser configuration or committed files. The public
   Project URL and publishable key are already in `supabase-config.json`.
5. Push the code and run **Update prices and deploy**. The first run atomically
   imports existing holdings and settings for each profile; subsequent runs never
   re-import or overwrite edits from CSV. It restores history from private Storage,
   reads live holdings/settings, checks prices/Discord alerts, and uploads private
   archives. The public Pages artifact contains only app assets and public config.
6. Open the website, choose Joe or Jacob, and enter that account's password. Use
   **Account & collection → Add or edit collection cards** for holdings. Wishlist
   and alert edits save automatically after a short delay. The manual Discord test
   remains available through its existing repository-scoped GitHub connection.

If the update fails, open the failed Actions run. A missing server secret, schema,
owner assignment or initial import is an error; the updater does not silently
reset holdings to CSV. No paid Supabase feature is needed by this implementation.

## Privacy and retention

Database RLS denies anonymous and unassigned users. Assigned users can read both
profiles, and can write only their own. Auth tokens persist in sessionStorage for
the current browser tab and are cleared on sign-out. Passwords are never stored by
the app. The browser never receives the server key. Supabase Storage uses a private
`portfolio-history` bucket with the same membership check. All published snapshots
require authentication. Historical snapshots keep their original holdings; edits
apply to current totals and future snapshots, not past ownership.

The public GitHub repository **still contains previously published CSV and JSON
history, including old Git revisions**. This change protects future live data and
future Pages deployments; it cannot retract existing public copies. To also hide
old data, repository history/visibility needs a separate decision. Do not describe
the previously public collection as confidential. GitHub Pages on a private repo
may require a paid GitHub plan; no repository visibility or billing changes are
made here.

Future histories live in Supabase **Storage**, not Postgres. The earlier compact
JSON estimate (~25 MB/year for both existing collections) therefore applies to
Storage growth, not the 500 MB database quota. The database stores current holdings
and settings, without adding one row per historical card price.

## Local checks

```
python -m unittest discover -s tests
node tests/test_market.cjs
node tests/test_github_settings.cjs
node tests/test_supabase.cjs
npm install --prefix work/sql-test --ignore-scripts @electric-sql/pglite@0.5.10
node tests/test_supabase_rls.cjs
```

The last test executes the migration in real embedded Postgres and checks both
accounts' read/write policies, anonymous/stranger denial, protected ownership and
initialization. It does not contact your production database.
