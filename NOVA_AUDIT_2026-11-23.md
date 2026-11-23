# NOVA BRAIN 3.0 — Read-only audit and staged fixes (2026-11-23)

Scope: source inspection of `main`, with changes staged ONLY on `audit/nova-2026-11-23`. No production deployment, merge, secret modification, or paid API requests.

## Confirmed from source
- Frontend previously sent only `message` although it retained conversation locally. Staged fix sends bounded `messages` history.
- Frontend health test checks Worker root only, not AI service. Staged fix clarifies this.
- Backend expects Bearer `NOVA_ACCESS_TOKEN` while frontend deliberately sends no secret. **Chat remains blocked until secure identity-based authentication is implemented.** Do not put this token in HTML or browser storage.
- Public GitHub Pages frontend repository is public. Static app code is visible; local browser notes are not automatically published.
- Worker returns HTTP 502 on upstream API errors and provides `upstream_status`. Frontend staged fix displays that safe status to aid diagnosis.

## Unverified / blocking
- Live deployed Worker revision, Cloudflare secrets presence, OpenAI billing, model access and actual chat behavior were not verified by this GitHub-only audit.
- No end-to-end tests or CI checks have been run.
- Secure browser login, abuse/rate limits, hard spending safeguards, and private app hosting remain outstanding.

## Safe next steps
1. Review staged diff against `main`.
2. Implement secure browser identity verification (e.g. Cloudflare Access) in backend and frontend without exposing backend tokens.
3. Add server-side rate limits and API spending controls.
4. Verify Cloudflare deployed revision and inspect sanitized upstream status (401/403/429) without logging keys or request bodies.
5. After API billing is enabled by the owner, run a minimal authenticated staging chat test; deploy only after explicit approval.
