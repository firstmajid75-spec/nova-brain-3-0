# NOVA memory security policy

Use fictional content in development and staging. Imported material is untrusted. The archive displays it through text nodes and processes supported ChatGPT HTML through JSON parsing. The app keeps passphrases transient, locks after five minutes of pointer and keyboard inactivity, and clears the visible archive when locked. Changing the archive passphrase rewraps the archive encryption key. If an older copy of the wrapping settings and record data was obtained, passphrase change does not revoke that copy.

Credential and sensitivity warnings are heuristic. Inspect a source before importing it. The locked archive protects encrypted record contents at rest. Access while unlocked, compromised devices or malicious browser updates can expose records. Recovery depends on knowing a valid passphrase for the relevant archive or backup. Browser-origin metadata and record counts may leak through database inspection.

The sole third-party runtime library is zip.js 2.25.0 (BSD-3-Clause), pinned and vendored with its license. ZIP extraction uses bounded streaming, safe-path checks and CRC verification. Relevant security checks are listed in the test report. A separate review of deployment isolation, cryptographic design and dependency advisories is pending.

SENTINEL integration requires independent enforcement. Imported authorizations are historical data. There are no remote archive calls or automated external actions in this phase.
