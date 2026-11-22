NOVA BRAIN 3.0 — Android PWA starter

FILES
- index.html: app interface
- manifest.webmanifest: installable app metadata
- sw.js: offline app-shell cache
- nova-icon-192.png / nova-icon-512.png: app icons

IMPORTANT
For Android Chrome's Install app / Add to Home screen flow, serve this folder from an HTTPS origin.
Opening index.html directly from Downloads (file://) does not reliably enable service workers or PWA installation.
A free static host such as GitHub Pages can serve this folder over HTTPS. Do not publish private API keys or sensitive notes.
