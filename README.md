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

**Images:** For project images, thumbnails, and the About photo, use **Upload from device** in the editor modals (alternative to pasting a URL or repo path). Files are committed into the repo under `projects/<slug>/` or `portfolio/` using your GitHub token; then **Publish** saves the JSON. Large images are resized in the browser before upload. The live site may take about a minute to show a newly uploaded file after GitHub Pages redeploys.

## Setup

No build tools required. Open `index.html` in a browser or deploy to any static hosting provider. The site is currently hosted via GitHub Pages with a custom domain.
