# Joyce Lee — Portfolio

Personal portfolio website for Joyce Lee, showcasing selected works.

**Live site:** [joycesqlee.com](https://joycesqlee.com)

## Structure

- `index.html` — Home page with project gallery
- `about.html` — About page
- `project.html` — Individual project template
- `css/` — Stylesheets
- `js/` — JavaScript
- `assets/` — Images and media
- `data/` — Project data
- `editor/` — Built-in content editor

## Content editor

Reveal edit mode with `Ctrl+Shift+E` or `?admin` in the URL. In edit mode you can change text inline and publish updates to `data/projects.json` via GitHub.

**Images:** For project images, thumbnails, and the About photo, use **Upload from device** in the editor modals (alternative to pasting a URL or repo path). When the publish worker is configured, uploads go through the worker (no browser token needed). Otherwise files are committed via the GitHub API using your stored token. Large images are resized in the browser before upload. The live site may take about a minute to show a newly uploaded file after GitHub Pages redeploys.

**Captions:** Each project image can have a caption shown below the image on the project page. Click the caption text in edit mode to change it inline.

**Crop / Fit:** Use the **Crop / Fit** button on each image in edit mode to set aspect ratio (16:9, 4:3, 1:1, or original), fit (cover/contain), and focal point. These are display settings stored in the project data, not changes to the image file.

## Setup

No build tools required. Open `index.html` in a browser or deploy to any static hosting provider. The site is currently hosted via GitHub Pages with a custom domain.

### Editor publishing

The built-in editor publishes changes to GitHub. For automated publishing (no token setup for Joyce):

1. Deploy the Cloudflare Worker in `publish-worker/` (`npx wrangler deploy`, then `npx wrangler secret put GITHUB_TOKEN`)
2. Set `PUBLISH_API_URL` in `editor/editor.js` to the worker URL (e.g. `https://joyce-portfolio-publish.<account>.workers.dev`)

The worker handles JSON publish (`/publish`) and image uploads (`/upload`) using a server-side GitHub token.

Without the worker, the editor falls back to a manual GitHub token stored in the browser.

## Git sync (agents and developers)

The live site deploys from `main` on GitHub. To avoid stale or conflicting work:

- **Cursor agents** — Project rule `.cursor/rules/sync-with-origin.mdc` requires `git fetch` / pull at the start of each chat and again before any push or deploy.
- **Manual sync** — Run `./scripts/sync-with-origin.sh` (fast-forward only; fails if you have uncommitted changes).
- **Optional hook** — After clone, run `git config core.hooksPath .githooks` so every `git push` runs the same sync first.

Cursor cannot pull from `origin` between chats automatically; the rule plus optional hook cover that gap.
