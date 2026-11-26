# NOVA memory test report

Run `python memory/tests/browser.py` with `python memory/serve.py` running and Chromium installed. The fixture is generated entirely from fictional records. The test checks vault setup, concurrent-session rejection, rejected malformed JSON and unsafe ZIPs, streamed inspection of a 12 MB ZIP, cancellation, numbered export import, duplicate and conflict handling, HTML and pasted content, timestamps and branches, notes and categorization, encrypted backup, tamper and wrong-passphrase handling, restore into a clean profile, responsive viewport, offline reload and search, and passphrase change.

Test environment is desktop Chromium with a mobile viewport emulation. Physical Windows S Mode/Edge, Android Chrome, hardware memory pressure, deployed SENTINEL, synchronization and existing NOVA end-to-end workflows require separate verification. The archive change is scoped to a new directory plus development instructions. Automated checks are not a security audit.

## Recorded run

Chromium 156 on Linux passed all eight acceptance groups, including rejection of wrong passphrases and tampered backups, restoration of three conversations and four messages in a new mobile-sized browser profile, and offline reload and search after service worker activation. The 12 MB ZIP was inspected by streaming records. This establishes functional behavior in the test environment. Physical target devices and an independent review remain pending.

## Phase 1 hardening run

All eight Chromium acceptance groups passed again, including the added fictional bearer-header exclusion, project-identifier retrieval, question search and source excerpt checks. Offline reload and search and clean-profile backup restoration also passed.
