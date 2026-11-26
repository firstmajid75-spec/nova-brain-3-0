"""Fictional end-to-end test. Run against serve.py on an unused browser profile."""
import io
import json
import tempfile
import zipfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

URL = "http://127.0.0.1:8765/"
PASSWORD = "fictional archive passphrase"
BACKUP = "fictional backup passphrase"
CONVERSATION = {
    "id": "imaginary-001",
    "title": "Fictional engineering notes",
    "mapping": {
        "root": {"children": ["alternate"], "message": {
            "author": {"role": "user"}, "create_time": 1700000000,
            "content": {"parts": ["Find the fictional bronze turbine."]},
        }},
        "alternate": {"parent": "root", "message": {
            "author": {"role": "assistant"}, "content": {"parts": ["Alternate branch."]},
        }},
    },
}


def zipped(items, compression=zipfile.ZIP_DEFLATED):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", compression) as archive:
        for name, content in items.items():
            archive.writestr(name, content)
    return data.getvalue()


def upload(page, name, data):
    page.locator("#files").set_input_files({"name": name, "mimeType": "application/octet-stream", "buffer": data})


def unlock(page, new=False, password=PASSWORD):
    page.locator("#password").fill(password)
    if new:
        page.locator("#confirmation").fill(password)
    page.locator("#unlock-button").click()


def restore(page, path, password):
    page.locator("#backup-file").set_input_files(path)
    page.locator("#restore-password").fill(password)
    page.get_by_role("button", name="Verify and restore").click()


with sync_playwright() as playwright, tempfile.TemporaryDirectory() as tmp:
    browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    context = browser.new_context()
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL)
    unlock(page, new=True)
    expect(page.locator("#counts")).to_have_text("0 conversations · 0 messages")
    expect(page.locator("#offline")).to_contain_text("cached")
    print("PASS create vault and cache app shell", flush=True)

    second = context.new_page()
    second.goto(URL)
    unlock(second)
    expect(second.locator("#status")).to_contain_text("another tab")
    second.close()
    print("PASS same-origin concurrent-session rejection", flush=True)

    page.get_by_role("button", name="Import My Conversations").click()
    upload(page, "invalid.zip", zipped({"../conversations.json": "[]"}))
    expect(page.locator("#status")).to_contain_text("Unsafe filename")
    upload(page, "malformed.json", b'[{"mapping":{}},]')
    expect(page.locator("#status")).to_contain_text("Malformed")
    upload(page, "expanded.zip", zipped({"conversations.json": " " * 1000000}))
    expect(page.locator("#status")).to_contain_text("decompression limits")

    large = [{"title": f"Fictional {idx}", "id": f"imaginary-{idx + 2}", "mapping": {
        "root": {"message": {"author": {"role": "user"}, "content": {"parts": ["z" * 100000]}}}
    }} for idx in range(120)]
    upload(page, "large.zip", zipped({"conversations.json": json.dumps(large)}, zipfile.ZIP_STORED))
    expect(page.locator("#status")).to_contain_text("Found 120", timeout=20000)
    page.evaluate("""() => {
        document.querySelector('#files').dispatchEvent(new Event('change'));
        document.querySelector('#cancel').click();
    }""")
    expect(page.locator("#status")).to_contain_text("Operation cancelled")
    expect(page.locator("#review")).to_be_empty()
    print("PASS bad input rejection, streamed 12 MB ZIP inspection and cancellation", flush=True)

    source = zipped({"nested/conversations-1.json": json.dumps([CONVERSATION]),
                     "user.json": json.dumps({"email": "fictional@example.invalid"})})
    upload(page, "export.zip", source)
    expect(page.locator("#status")).to_contain_text("Found 1")
    page.get_by_role("button", name="Import selected (1)").click()
    expect(page.locator("#status")).to_contain_text("Saved 1 of 1")
    upload(page, "updated.zip", source)
    expect(page.locator("#review")).to_contain_text("1 potential duplicates")
    upload(page, "chat.html", ('<script>var jsonData = ' + json.dumps([CONVERSATION]) + ';</script>').encode())
    expect(page.locator("#review")).to_contain_text("1 potential duplicates")
    changed = dict(CONVERSATION, title="Different title")
    upload(page, "changed.json", json.dumps(changed).encode())
    expect(page.locator("#review")).to_contain_text("1 conflicts")
    upload(page, "secret.txt", b"api_key = fictional-secret")
    expect(page.locator("#review")).to_contain_text("1 excluded for possible credentials")
    print("PASS numbered ZIP import, metadata exclusion, duplicates, conflicts and credential flag", flush=True)

    upload(page, "unsafe.html", b'<img src="https://invalid.example/"> Fictional HTML')
    page.get_by_role("button", name="Import selected (1)").click()
    expect(page.locator("#status")).to_contain_text("Saved 1 of 1")
    page.get_by_role("button", name="Save New Conversation").click()
    page.locator("#title").fill("Fictional directive")
    page.locator("#paste").fill("Sample pasted conversation.")
    page.get_by_role("button", name="Review before saving").click()
    page.get_by_role("button", name="Import selected (1)").click()
    expect(page.locator("#status")).to_contain_text("Saved 1 of 1")

    page.get_by_role("button", name="My Conversations", exact=True).click()
    page.get_by_role("button", name="unsafe.html").click()
    expect(page.locator("#detail pre")).to_contain_text("<img src=")
    assert page.locator("#detail img").count() == 0
    page.locator("#query").fill("bronze turbine")
    page.get_by_role("button", name=CONVERSATION["title"]).click()
    expect(page.locator("#detail")).to_contain_text("Parent root")
    expect(page.locator("#detail")).to_contain_text("2023")
    expect(page.locator("#detail")).to_contain_text("Alternate branch.")
    page.get_by_label("Categories").fill("Engineering, Invention")
    page.get_by_label("Private note").fill("Fictional annotation")
    page.get_by_label("Bookmark", exact=True).check()
    page.get_by_role("button", name="Save changes").click()
    expect(page.locator("#status")).to_have_text("Changes saved.")
    print("PASS inert HTML, manual saving, search, timestamps, branches and annotation", flush=True)

    page.get_by_role("button", name="Backup & Restore").click()
    page.locator("#backup-password").fill(BACKUP)
    page.locator("#backup-confirm").fill(BACKUP)
    file = Path(tmp) / "archive.novabak"
    with page.expect_download() as download:
        page.get_by_role("button", name="Download encrypted backup").click()
    download.value.save_as(file)
    data = file.read_bytes()
    assert data.startswith(b"NOVABAK1") and b"bronze turbine" not in data
    tampered = Path(tmp) / "tampered.novabak"
    tampered.write_bytes(data[:-1] + bytes([data[-1] ^ 1]))
    restore(page, tampered, BACKUP)
    expect(page.locator("#status")).to_contain_text("damaged backup")
    restore(page, file, "incorrect fictional password")
    expect(page.locator("#status")).to_contain_text("damaged backup")
    page.once("dialog", lambda dialog: dialog.accept())
    restore(page, file, BACKUP)
    expect(page.locator("#status")).to_contain_text("3 duplicates")
    print("PASS encrypted download, wrong passphrase, tamper rejection and local deduplication", flush=True)

    fresh = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    phone = fresh.new_page()
    phone.goto(URL)
    unlock(phone, new=True)
    phone.get_by_role("button", name="Backup & Restore").click()
    phone.once("dialog", lambda dialog: dialog.accept())
    restore(phone, file, BACKUP)
    expect(phone.locator("#status")).to_contain_text("Restored 3 conversations")
    phone.get_by_role("button", name="Overview").click()
    expect(phone.locator("#counts")).to_have_text("3 conversations · 4 messages")
    assert phone.evaluate("document.documentElement.scrollWidth === window.innerWidth")
    expect(phone.locator("#offline")).to_contain_text("cached")
    phone.wait_for_function("navigator.serviceWorker.controller !== null")
    fresh.set_offline(True)
    phone.reload()
    unlock(phone)
    phone.get_by_role("button", name="My Conversations", exact=True).click()
    phone.locator("#query").fill("Fictional annotation")
    phone.get_by_role("button", name=CONVERSATION["title"], exact=False).click()
    expect(phone.locator("#detail")).to_contain_text("bronze turbine")
    print("PASS fresh-profile mobile-viewport restore and offline reload/search", flush=True)

    page.get_by_role("button", name="Lock archive").click()
    expect(page.locator("#workspace")).to_be_hidden()
    unlock(page, password="wrong archive password")
    expect(page.locator("#status")).to_contain_text("Incorrect archive passphrase")
    unlock(page)
    expect(page.locator("#counts")).to_have_text("3 conversations · 4 messages")
    page.get_by_role("button", name="Backup & Restore").click()
    page.locator("summary").filter(has_text="Archive settings").click()
    rotated = "fictional rotated passphrase"
    page.locator("#current-password").fill(PASSWORD)
    page.locator("#new-password").fill(rotated)
    page.locator("#new-confirm").fill(rotated)
    page.get_by_role("button", name="Change archive passphrase").click()
    expect(page.locator("#status")).to_contain_text("passphrase updated")
    page.get_by_role("button", name="Lock archive").click()
    unlock(page)
    expect(page.locator("#status")).to_contain_text("Incorrect archive passphrase")
    unlock(page, password=rotated)
    expect(page.locator("#counts")).to_have_text("3 conversations · 4 messages")
    assert not errors, errors
    print("PASS explicit lock, passphrase rejection and passphrase change", flush=True)
