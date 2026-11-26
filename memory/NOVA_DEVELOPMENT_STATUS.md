# NOVA development status

Repository `firstmajid75-spec/nova-brain-3-0`, branch `development/personal-intelligence-archive-1`. Use `git log -1` for the exact checkout revision. See `NOVA_MEMORY_TEST_REPORT.md` for the acceptance suite and test boundaries.

The Phase 1 archive runs on a dedicated loopback origin. It has no production entry-point modifications or service dependencies. Sources reviewed include BRAIN 3.0 `09edb37`, PRIME `f27fe40`, and Worker `22a4555`. The archive exchanges encrypted backup bundles manually. Remote access, archive synchronization, Founder profile, SENTINEL enforcement, decisions and project reconstruction are pending.

Start with a fictional archive. The next milestone is the independently authenticated shared memory design with Founder-approved integration. Production deployment, paid services, sensitive external data transfers and security-authority changes require approval.

## Hosted staging

The Vercel project creation reported authentication enabled. The deploy connector nevertheless assigned a production target and a public default alias, including when the request explicitly selected the preview target. Both isolated projects were paused. Builds contained only application assets. No archive records or credentials were deployed. A protected preview URL remains pending until the connector or another approved host can make every deployment alias require authentication from the first build.

A separate owner-private Sites staging deployment is now live at https://ilunova-memory-staging.meanderingswan10.chatgpt.site/. It serves only archive application assets from the isolated staging source commit `88c15ef56b65c72771fcdab70dd4673c37b10719`, based on development commit `2d86e4363a797524671fd0935b46a7f8f3e50592`. Keep staging limited to fictional records. Cloud Chrome reached the ChatGPT sign-in gate, and signed-out requests for the root page, app script and service worker each returned HTTP 401. Signed-in Founder access and physical Edge/Android checks are pending. The NOVA production branch was unaffected.
