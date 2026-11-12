# AGENTS.md

Guidance for AI agents working in this repository.

## Cursor Cloud specific instructions

### Product

Single static portfolio site (Joyce Lee) with an optional Cloudflare Worker in `publish-worker/` for editor publishing. No `package.json`, build step, or database.

### Running locally

Serve the repo root over HTTP (required for `fetch('data/projects.json')` — `file://` will not work):

```bash
cd /workspace && python3 -m http.server 8080
```

Open `http://127.0.0.1:8080/index.html`. Ports **8080** and **5500** are the origins allowed by the publish worker CORS config if you test editor publish against a deployed worker.

### Lint / test / build

There is no project-local linter or test suite. CI (`.github/workflows/deploy-pages.yml`) only uploads the static tree to GitHub Pages. Validate changes by loading pages in a browser or with HTTP checks against `data/projects.json` and key HTML routes.

### Editor

- Reveal admin UI: `Ctrl+Shift+E` or `?admin` on any page.
- Publish to GitHub uses `PUBLISH_API_URL` in `editor/editor.js` (deployed worker) or a browser-stored GitHub PAT fallback.
- Full publish → live deploy requires GitHub credentials and is not needed for local UI testing.

### Optional: publish worker

Only when changing or testing the worker:

```bash
cd publish-worker && npx wrangler dev
```

Requires `GITHUB_TOKEN` via `npx wrangler secret put GITHUB_TOKEN` for publish API calls. See `README.md` and `publish-worker/wrangler.toml`.
