# NOVA archive format v1

IndexedDB `nova-archive-v1` has settings, records and history stores. Settings hold a 16-byte random salt and a wrapped random 256-bit archive key. Web Crypto derives a wrapping key using PBKDF2-HMAC-SHA256 with 600,000 iterations. Envelopes use AES-256-GCM, a fresh random 96-bit nonce, and purpose-specific authenticated data. Record and activity IDs appear as keys outside the encrypted payload. Time and volume can be inferred from database metadata.

Records contain title, source filename, source ID where present, normalized messages, raw source data, content hash, warnings and annotation fields. ChatGPT source IDs yield stable SHA-256 record IDs. Records without source identifiers use a content-derived ID. Raw ChatGPT objects retain message graph and source metadata. Generic text documents retain their original decoded text. Conflicts with an existing ID and a different content hash are flagged and skipped.

Backup bytes are ASCII `NOVABAK1`, 16-byte salt, 12-byte nonce, and AES-GCM ciphertext plus tag over UTF-8 JSON `{"records":[...]}`, authenticated with the string `NOVA backup v1`. The backup password derives an independent key. Restore verifies the tag and record schema before merging in one transaction. Backup excludes device settings and import history. The v1 backup and restore cap is 64 MiB.
