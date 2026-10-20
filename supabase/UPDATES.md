# Health, weekly breakdown, activity, and card charts

Run `migrations/202610200001_activity.sql` once in the Supabase SQL Editor. It adds an append-only activity log and database trigger. Both authorized members can view both logs; owners can still edit only their own holdings. Activity begins when the migration is installed, including subsequent Table Editor changes. Earlier activity cannot be reconstructed. Refresh activity or load older entries on the dashboard.

The health indicator checks the latest saved prices against the 7 AM/7 PM America/New_York target, allowing one hour for scheduling delays. It distinguishes overdue prices, reported job failures, and Discord delivery failures. A background health file is published after the price job, including when an earlier step fails. A missing health file is shown explicitly.

Weekly breakdown compares current quantities with the saved baseline at least seven calendar days earlier, displaying matched dollar/percentage changes, five gainers/losers, and change by binder. Missing prices and proxies are excluded; source changes are marked as estimates. The Discord weekly recap uses the latest snapshot at least 168 hours earlier. It sends on the first successful scheduled check after Monday at 7 AM, once per week per destination, in addition to ordinary twice-daily summaries.

Use **Chart** in the collection table or **History** in the wishlist for exact-printing, exact-finish unit-price history. Hover, tap, or use arrow keys to inspect saved points. Choose week/month/all history; amber dashed segments indicate provider changes.

## Discord patch notes

For each user-facing release, update `release-notes.json`: set a new unique `version`, the release `date`, and concise `notes`. After a successful Pages deployment, the workflow posts those notes and the respective collection link to each configured Discord destination. Ordinary price checks do not create a new release announcement. A version marker is saved only after successful delivery, in private Storage under `main/notification-state.json` or `jacob/notification-state.json`; weekly recap markers live there too. Failed announcements retry on the next deployment. Keep that file to avoid repeats. A crash between delivery and saving its marker can cause a retry duplicate.

The existing GitHub repository secrets are used; no new secrets or Edge Function deployment are required. All new site assets are copied by the Pages workflow. Existing public graph buttons keep sending the latest saved collection summary.
