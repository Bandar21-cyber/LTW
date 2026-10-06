# Volunteer Roster: Netlify setup

This folder is the whole site:

- `index.html`: the roster, sign-up forms and admin tools
- `netlify/functions/signups.mjs`: server code that lets admins log in and pulls sign-ups from Netlify Forms
- `assets/`: the Light the World logo (header and login) and the Giving Machine photo (sign-up form)
- `netlify.toml`: tells Netlify where the site and function are

Sign-ups sync into the roster automatically every minute while an admin is logged in.

## One-time setup

1. **Deploy with Git or the Netlify CLI, not drag-and-drop.** Drag-and-drop doesn't deploy functions.
   - Git: put this folder's contents in a GitHub repo, then in Netlify choose **Add new site > Import an existing project** and pick the repo. Leave the build command empty.
   - CLI: from this folder run `npx netlify-cli deploy --prod`.
2. **Create an access token:** in Netlify, click your avatar > **User settings > Applications > Personal access tokens > New access token**. Copy it.
3. **Add it to the site:** **Site configuration > Environment variables > Add a variable**. Key `NETLIFY_API_TOKEN`, value = the token. Scope it to Functions.
4. **Turn on form detection:** **Site configuration > Forms > Enable form detection**.
5. **Redeploy** so the token and form are picked up (Deploys > Trigger deploy).
6. Submit a test sign-up, log in as an admin, and click **Sync now**. The test person should appear.

## Changing admins or passwords

Admin password hashes live in two places that must match: `CONFIG.admins` in `index.html` and `ADMINS` in `netlify/functions/signups.mjs`.

Keep the access token private. It is only ever read on the server.
