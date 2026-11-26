# NOVA memory architecture

The isolated web app organizes NPIA (library), NUME (versioned local records and retrieval), NCB (file and paste import), NPV (whole-archive local encryption), and NMRS / NICS (portable backup and restore). NKRE is planned. The initial app has a single Founder archive and a local passphrase. Shared memory, a separate sensitive vault and independent SENTINEL integration are future phases.

`core.js` handles parsing, cryptography, IndexedDB persistence and encrypted backup. `app.js` handles session locking, import review, search, and archive operations. A dedicated service worker caches only the application shell. A Web Lock serializes sessions on the same browser origin. No network calls send archive data.

At the inspected BRAIN 3.0 base `09edb37`, projects and notes use localStorage, and chat calls a separately hosted Cloudflare Worker. Its root service worker owns broad caching. BRAIN PRIME `f27fe40` is a static prototype with documented independent authentication and shutdown requirements. Cloudflare Worker `22a4555` contains bearer-token and origin checks, input bounds, and a provider proxy. The inspected Worker source has no archive endpoint, durable SENTINEL enforcement or rate limiting. The deployed Worker configuration was not verified.

Keep future archive staging on a dedicated origin. Separate browser origins have separate IndexedDB databases. A future versioned retrieval service must authenticate the caller and device, enforce SENTINEL state and record grants, and return only approved source excerpts. The encrypted v1 bundle is the current manual transfer format.
