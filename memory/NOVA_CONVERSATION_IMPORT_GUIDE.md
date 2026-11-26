# Import My Conversations

1. Start `python memory/serve.py`. Open `http://127.0.0.1:8765/` in a current browser and create a passphrase.
2. Open **Import My Conversations** and choose one or more files. For an initial trial, use fictional data.
3. Review the detected count, duplicates, conflicting versions and sensitivity hints. Clear any selections you want to exclude.
4. Choose **Import selected**. A cancelled import can be reopened. Conversations already saved will appear as duplicates.
5. Use **My Conversations** to search, bookmark, add categories and review original source data.

Supported input includes ChatGPT JSON objects and arrays, ZIP exports with named or numbered conversation JSON entries, and HTML exports with a supported `jsonData` array. ZIP imports use matching JSON when present and otherwise look for `chat.html`. Generic HTML, Markdown and text appear as searchable text. Attachment references stay in source metadata. Attached binaries and account files are excluded. Manual saving supports pasted conversations, selected messages, directives, decisions and research. Role and time fields are preserved when supplied by a supported export.

An import allows up to 25,000 conversations, approximately 8 MiB per text document or JSON conversation, up to 1 GiB of supported ZIP expansion and up to 8 GiB of ZIP input. Expansion ratios and ZIP entry counts are also limited. Imports can be resumed by reinspection. Browser storage quota and device memory may impose lower limits.
