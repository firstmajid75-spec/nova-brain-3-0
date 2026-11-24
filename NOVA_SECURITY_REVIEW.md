# NOVA BRAIN 3.0 — frontend security review

This branch is for founder review only; it is not deployed.

- The public GitHub Pages frontend calls the Worker /chat endpoint without a bearer token.
- The backend staging source expects NOVA_ACCESS_TOKEN. Do not insert that token into frontend source, browser storage, or a public repository.
- The "Test connection" button only checks the Worker health endpoint, not OpenAI chat connectivity.
- The browser's project and knowledge notes are stored in localStorage, not encrypted; do not store secrets or highly sensitive personal information there.
- GitHub Pages is publicly reachable. A private GitHub repository alone does not make an existing Pages deployment private.
- Recommended next phase: protect the frontend and API with verified user authentication (e.g. Cloudflare Access), validate access in the Worker, and add rate/spend limits. Test CORS and authentication together.
- Preserve the current UI and existing browser storage keys. Do not change the production app until the founder approves a tested plan.
