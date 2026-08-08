# ULTRA

A private-first streak tracker. It works offline with browser storage and can
optionally sync the same habit data between a computer and phone through
Supabase.

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

## Publish later with GitHub Pages

The repository is already a static Pages-compatible site. When ready, push it
to GitHub and select **Settings > Pages > Deploy from a branch**, using the
repository root. No publishing has been performed yet.

If email confirmation is enabled in Supabase, add the final GitHub Pages URL to
Authentication > URL Configuration before creating the production account.
