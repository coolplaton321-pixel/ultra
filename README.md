# ULTRA

A private-first habits and personal-finance tracker. Habit clicks work offline
with browser storage and sync between devices through Supabase. The myFinances
workspace stores its figures only in a signed-in user's private Supabase row;
balances are never embedded in the public site files.

## Run locally

Serve this directory instead of opening `index.html` directly:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Enable PC + phone sync

1. Create a Supabase project.
2. Open its SQL Editor and run `supabase-setup.sql` once.
3. In Supabase Authentication, enable Email authentication.
4. Copy the project URL and public anon/publishable key into `config.js`.
5. Reload ULTRA, open **Data & backup**, and create an account.
6. Sign in with the same email and password on the phone.

Only the public browser key belongs in `config.js`. Never add a Supabase
`service_role` or secret key to this project.

`ultra_state` stores the habit document and `finance_state` stores the finance
document. Both tables use row-level security keyed to `auth.uid()` and deny
anonymous table access.

New habits and archived habits share the same private `ultra_state` document.
The October 2026 update adds the new habit logs while retaining all previous
logs, nutrition records, and streak history. Open **Previous habits — calendars**
or **Previous habits — totals** to view the archive. The tracker retries sync
when the connection returns, as well as on focus and during regular checks.

After opening the published site, sign in with the same Supabase account and
wait for **Cloud saved**. Browser storage is separate for the local file and
the published site; Supabase provides the shared copy between them.

## Publish with GitHub Pages

The repository is already a static Pages-compatible site. When ready, push it
to GitHub and select **Settings > Pages > Deploy from a branch**, using the
repository root.

If email confirmation is enabled in Supabase, add the final GitHub Pages URL to
Authentication > URL Configuration before creating the production account.
