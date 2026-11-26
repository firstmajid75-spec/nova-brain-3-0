import { database, read, write, keys, derive, seal, open, importFile, exportBackup, readBackup, MiB } from './core.js';

const $ = id => document.getElementById(id);
const status = message => { $('status').textContent = message; };
const node = (tag, text) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
};
const abortError = new DOMException('Operation cancelled.', 'AbortError');
const date = value => {
  if (typeof value !== 'number' && typeof value !== 'string') return '';
  const time = new Date(typeof value === 'number' && Math.abs(value) < 1e12 ? value * 1000 : value);
  return Number.isNaN(time.valueOf()) ? '' : time.toLocaleString();
};
const archiveKey = raw => crypto.subtle.importKey('raw', new Uint8Array(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
async function wrap(password, raw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt, envelope: await seal(await derive(password, salt), 'NOVA archive key v1', raw) };
}
async function unwrap(password, config) {
  try {
    return await open(await derive(password, config.salt), 'NOVA archive key v1', config.envelope);
  } catch {
    throw Error('Incorrect archive passphrase or damaged archive settings.');
  }
}

let db, key, release, config, timer, work, working, review, activeView, searchTimer;
let matches = [], shown = 0;
const getRecord = async (id, sessionKey = key) => {
  const encrypted = await read(db, 'records', id);
  return encrypted && open(sessionKey, 'record:' + id, encrypted);
};
const recordOp = async (record, add = false) => ({
  store: 'records', id: record.id, value: await seal(key, 'record:' + record.id, record), add,
});
async function historyOp(label) {
  const id = Date.now().toString().padStart(15, '0') + '-' + crypto.randomUUID();
  return { store: 'history', id, value: await seal(key, 'history:' + id, { label, at: Date.now() }) };
}

function setGate() {
  $('gate-title').textContent = config ? 'Unlock your archive' : 'Create your archive';
  $('gate-help').textContent = config ? 'Enter your archive passphrase to continue.' :
    'Choose a passphrase with at least 12 characters. Store it safely so you can unlock this archive.';
  $('unlock-button').textContent = config ? 'Unlock archive' : 'Create archive';
  $('confirm-label').hidden = Boolean(config);
  $('confirmation').required = !config;
  $('password').minLength = config ? 1 : 12;
  $('password').autocomplete = config ? 'current-password' : 'new-password';
  $('unlock').hidden = false;
  $('gate').hidden = false;
}

function activity() {
  if (!key) return;
  clearTimeout(timer);
  timer = setTimeout(() => void lock('Archive locked after 5 minutes of inactivity.'), 5 * 60 * 1000);
}
async function lock(message = 'Archive locked.') {
  const finishing = working;
  work?.abort(abortError);
  clearTimeout(searchTimer);
  $('workspace').hidden = true;
  $('lock').hidden = true;
  if (finishing) await finishing;
  $('detail').replaceChildren();
  for (const id of ['results', 'review', 'history', 'counts', 'storage', 'result-count']) $(id).replaceChildren();
  for (const form of $('workspace').querySelectorAll('form')) form.reset();
  $('files').value = '';
  $('query').value = '';
  matches = [];
  review = null;
  clearTimeout(timer);
  key = null;
  release?.();
  release = null;
  setGate();
  status(message);
  $('password').focus();
}

async function view(name) {
  activeView = name;
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== name;
  for (const button of document.querySelectorAll('[data-view]')) {
    if (button.dataset.view === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (name === 'library') await search();
  if (name === 'home') await dashboard();
}
function run(operation, cancellable = false) {
  if (!key || work || $('workspace').hidden) return Promise.resolve();
  const controller = new AbortController();
  work = controller;
  $('cancel').hidden = !cancellable;
  $('workspace').setAttribute('aria-busy', 'true');
  for (const button of $('workspace').querySelectorAll('button')) {
    if (button.id !== 'cancel') button.disabled = true;
  }
  working = (async () => {
    try {
      await operation(controller.signal);
    } catch (error) {
      if (!$('workspace').hidden) {
        status(error.name === 'AbortError' ? 'Operation cancelled.' :
          error.name === 'QuotaExceededError' ? 'Device storage is full. Make a backup or free storage.' :
          error instanceof SyntaxError ? 'The selected file could not be parsed.' : error.message);
      }
    } finally {
      work = null;
      working = null;
      $('workspace').removeAttribute('aria-busy');
      $('cancel').hidden = true;
      for (const button of $('workspace').querySelectorAll('button')) button.disabled = false;
    }
  })();
  return working;
}

function acquire() {
  return new Promise((resolve, reject) => {
    navigator.locks.request('nova-archive-v1', { ifAvailable: true }, lockHandle => {
      if (!lockHandle) { reject(Error('The archive is open in another tab. Lock it there first.')); return; }
      return new Promise(done => { release = done; resolve(); });
    }).catch(reject);
  });
}
$('unlock').onsubmit = async event => {
  event.preventDefault();
  $('unlock-button').disabled = true;
  const password = $('password').value;
  const confirmation = $('confirmation').value;
  $('unlock').reset();
  try {
    await acquire();
    config = await read(db, 'settings', 'vault');
    if (!config) {
      if (password.length < 12 || password !== confirmation) throw Error('Enter matching passphrases with at least 12 characters.');
      const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)));
      const next = await wrap(password, raw);
      await write(db, [{ store: 'settings', id: 'vault', value: next, add: true }]);
      config = next;
      key = await archiveKey(raw);
    } else {
      key = await archiveKey(await unwrap(password, config));
    }
    $('gate').hidden = true;
    $('workspace').hidden = false;
    $('lock').hidden = false;
    status('');
    activity();
    await run(() => view('home'));
  } catch (error) {
    release?.();
    release = null;
    setGate();
    status(error.message);
  } finally {
    $('unlock-button').disabled = false;
  }
};
$('lock').onclick = () => void lock();
$('cancel').onclick = () => work?.abort(abortError);
document.addEventListener('pointerdown', activity);
document.addEventListener('keydown', activity);

async function dashboard() {
  const sessionKey = key;
  const recordIds = await keys(db, 'records');
  let messages = 0;
  for (const id of recordIds) {
    if (work?.signal.aborted) return;
    messages += (await getRecord(id, sessionKey))?.messages.length ?? 0;
  }
  $('counts').textContent = `${recordIds.length} conversations · ${messages} messages`;
  const estimate = await navigator.storage.estimate();
  $('storage').textContent = estimate.quota ?
    `Browser storage estimate: ${((estimate.usage ?? 0) / MiB).toFixed(1)} MiB used of ${Math.round(estimate.quota / MiB)} MiB.` :
    'Storage quota estimate unavailable.';
  $('history').replaceChildren();
  const entries = (await keys(db, 'history')).slice(-30).reverse();
  for (const id of entries) {
    if (work?.signal.aborted) return;
    const entry = await open(sessionKey, 'history:' + id, await read(db, 'history', id));
    $('history').append(node('li', `${date(entry.at)} · ${entry.label}`));
  }
  if (!entries.length) $('history').append(node('li', 'No activity yet.'));
}

async function* fromFiles(files, signal, manual) {
  for (const file of files) yield* importFile(file, signal, manual);
}
async function inspect(files, signal, manual = false) {
  review = null;
  $('review').replaceChildren();
  const estimate = await navigator.storage.estimate();
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (estimate.quota && bytes > estimate.quota - (estimate.usage ?? 0)) {
    throw Error('Selected input exceeds estimated free browser storage.');
  }
  const summaries = [];
  const seen = new Map();
  let count = 0;
  status('Inspecting files locally…');
  for await (const record of fromFiles(files, signal, manual)) {
    signal.throwIfAborted();
    if (++count > 25000) throw Error('Import exceeds 25,000 conversations. Split the input or choose fewer files.');
    const previous = seen.has(record.id) ? seen.get(record.id) : (await getRecord(record.id))?.hash;
    const duplicate = previous === record.hash;
    const conflict = Boolean(previous && !duplicate);
    const credentials = record.flags.includes('Possible credentials');
    summaries.push({
      id: record.id, hash: record.hash, title: record.title, flags: record.flags,
      duplicate, conflict, credentials, selected: !duplicate && !conflict && !credentials,
    });
    if (!previous && !credentials) seen.set(record.id, record.hash);
    if (count % 20 === 0) status(`Inspected ${count} conversations…`);
  }
  signal.throwIfAborted();
  review = { files, summaries, manual };
  renderReview();
  status(`Inspection complete. Found ${count} conversations.`);
}
function renderReview() {
  const output = $('review');
  output.replaceChildren();
  output.append(node('h2', 'Review your import'));
  const count = flag => review.summaries.filter(item => item[flag]).length;
  const flagged = [...new Set(review.summaries.flatMap(item => item.flags))];
  output.append(node('p', `${review.summaries.length} found · ${count('duplicate')} potential duplicates · ${count('conflict')} conflicts · ${count('credentials')} excluded for possible credentials.`));
  output.append(node('p', flagged.length ? 'Possible sensitive content: ' + flagged.join(', ') + '. Review before importing.' :
    'No sensitive categories matched the basic checks. Review the source before importing private material.'));
  const controls = node('div');
  const list = node('div');
  let page = 0;
  const back = node('button', 'Previous');
  const next = node('button', 'Next');
  const all = node('button', 'Select eligible');
  const none = node('button', 'Clear selection');
  const save = node('button');
  save.className = 'primary';
  const eligible = item => !item.duplicate && !item.conflict && !item.credentials;
  const update = () => { save.textContent = `Import selected (${count('selected')})`; };
  const show = () => {
    list.replaceChildren();
    for (const item of review.summaries.slice(page * 50, (page + 1) * 50)) {
      const label = node('label');
      label.className = 'check';
      const input = node('input');
      input.type = 'checkbox';
      input.checked = item.selected;
      input.disabled = !eligible(item);
      input.onchange = () => { item.selected = input.checked; update(); };
      const tags = [item.duplicate && 'duplicate', item.conflict && 'conflicting version', ...item.flags].filter(Boolean);
      label.append(input, ' ' + item.title + (tags.length ? ' · ' + tags.join(', ') : ''));
      list.append(label);
    }
    back.hidden = page === 0;
    next.hidden = (page + 1) * 50 >= review.summaries.length;
    update();
  };
  back.onclick = () => { page--; show(); };
  next.onclick = () => { page++; show(); };
  all.onclick = () => { review.summaries.forEach(item => { item.selected = eligible(item); }); show(); };
  none.onclick = () => { review.summaries.forEach(item => { item.selected = false; }); show(); };
  save.onclick = () => void run(commitImport, true);
  controls.append(all, none);
  output.append(controls, list, back, next, save);
  show();
}
async function commitImport(signal) {
  const { files, summaries, manual } = review;
  const chosen = summaries.filter(item => item.selected).length;
  if (!chosen) { status('Select at least one eligible conversation.'); return; }
  let index = 0;
  let saved = 0;
  let failure;
  try {
    for await (const record of fromFiles(files, signal, manual)) {
      signal.throwIfAborted();
      const expected = summaries[index++];
      if (!expected || record.id !== expected.id || record.hash !== expected.hash) {
        throw Error('The source changed after review. Inspect it again.');
      }
      if (expected.selected) {
        await write(db, [await recordOp(record, true), await historyOp('Imported one conversation.')], signal);
        saved++;
        status(`Imported ${saved} of ${chosen} selected conversations…`);
      }
    }
    if (index !== summaries.length) throw Error('The source changed after review.');
  } catch (error) {
    failure = error;
  }
  if (saved && !signal.aborted) {
    await write(db, [await historyOp(`Import ${failure ? 'interrupted' : 'complete'}. Saved ${saved} of ${chosen} selected.`)]);
  }
  review = null;
  $('files').value = '';
  $('review').replaceChildren();
  if (!$('workspace').hidden) {
    if (failure && failure.name !== 'AbortError') status(`Saved ${saved} of ${chosen}. Import stopped. Inspect the source again to retry.`);
    else status(`Saved ${saved} of ${chosen} selected conversations.${failure ? ' Import cancelled. Reopen the file to resume.' : ''}`);
  }
}

$('files').onchange = () => void run(signal => inspect([...$('files').files], signal), true);
$('save').onsubmit = event => {
  event.preventDefault();
  void run(async signal => {
    const file = new File([$('paste').value], $('title').value.trim() || 'Untitled conversation');
    await view('import');
    await inspect([file], signal, true);
    $('save').reset();
  }, true);
};

const queryWords = value => value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const questionWords = new Set(['about', 'did', 'discuss', 'find', 'for', 'me', 'my', 'our', 'show',
  'the', 'was', 'we', 'were', 'what', 'where', 'which', 'who']);
const originalObject = record => record.format === 'json' ? record.original ?? {} : {};

async function search(signal = work?.signal) {
  const words = queryWords($('query').value);
  const keywords = words.filter(word => !questionWords.has(word));
  const terms = keywords.length ? keywords : words;
  const found = [];
  $('result-count').textContent = 'Searching…';
  $('detail').hidden = true;
  $('detail').replaceChildren();
  $('results').replaceChildren();
  for (const id of await keys(db, 'records')) {
    signal?.throwIfAborted();
    const record = await getRecord(id);
    const original = originalObject(record);
    const fields = [record.title, record.note, original.project_id, original.gizmo_id,
      ...record.categories, ...record.messages.map(message => message.text)]
      .filter(value => typeof value === 'string').map(value => value.toLocaleLowerCase());
    if (terms.every(term => fields.some(field => field.includes(term)))) {
      const excerpt = terms.length ? record.messages.find(message => {
        const content = message.text.toLocaleLowerCase();
        return terms.every(term => content.includes(term));
      })?.text.slice(0, 220) : undefined;
      found.push({ id, title: record.title, bookmark: record.bookmark, excerpt });
    }
  }
  matches = found.sort((a, b) => Number(b.bookmark) - Number(a.bookmark) || a.title.localeCompare(b.title));
  shown = 0;
  $('result-count').textContent = `${matches.length} conversations found.`;
  renderResults();
}
function renderResults() {
  for (const item of matches.slice(shown, shown + 40)) {
    const li = node('li');
    const button = node('button', (item.bookmark ? '★ ' : '') + item.title);
    button.onclick = () => void run(() => detail(item.id));
    li.append(button);
    if (item.excerpt) li.append(node('p', item.excerpt));
    $('results').append(li);
  }
  shown += 40;
  $('more').hidden = shown >= matches.length;
}
$('more').onclick = renderResults;
$('query').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    await working;
    if (activeView === 'library') void run(search, true);
  }, 250);
});

async function detail(id) {
  const record = await getRecord(id);
  const article = $('detail');
  article.replaceChildren(node('h2', record.title), node('p', 'Source: ' + record.source));
  if (record.sourceId) article.append(node('p', 'Conversation ID: ' + record.sourceId));
  const originalMetadata = originalObject(record);
  const project = originalMetadata.project_id ?? originalMetadata.gizmo_id;
  if (typeof project === 'string') article.append(node('p', 'Source project: ' + project));
  const created = date(originalMetadata.create_time);
  if (created) article.append(node('p', 'Conversation created: ' + created));
  const form = node('form');
  const categoryLabel = node('label', 'Categories (comma-separated)');
  const categories = node('input');
  categories.maxLength = 512;
  categories.value = record.categories.join(', ');
  categoryLabel.append(categories);
  const noteLabel = node('label', 'Private note');
  const note = node('textarea');
  note.maxLength = 10000;
  note.value = record.note;
  noteLabel.append(note);
  const bookmarkLabel = node('label', 'Bookmark ');
  bookmarkLabel.className = 'check';
  const bookmark = node('input');
  bookmark.type = 'checkbox';
  bookmark.checked = record.bookmark;
  bookmarkLabel.append(bookmark);
  form.append(categoryLabel, noteLabel, bookmarkLabel, node('button', 'Save changes'));
  form.onsubmit = event => {
    event.preventDefault();
    void run(async signal => {
      const updated = { ...record, categories: [...new Set(categories.value.split(',').map(x => x.trim()).filter(Boolean))],
        note: note.value, bookmark: bookmark.checked };
      await write(db, [await recordOp(updated)], signal);
      await search(signal);
      await detail(id);
      status('Changes saved.');
    });
  };
  article.append(form);
  const remove = node('button', 'Delete conversation');
  remove.className = 'danger';
  remove.onclick = () => {
    if (!confirm('Permanently delete this conversation from this device? Copies in exported backups remain.')) return;
    void run(async signal => {
      await write(db, [{ store: 'records', id }, await historyOp('Deleted one conversation.')], signal);
      await search(signal);
      status('Conversation deleted.');
    });
  };
  article.append(remove);
  let count = 0;
  const list = node('div');
  const more = node('button', 'Show more messages');
  const show = () => {
    for (const message of record.messages.slice(count, count + 25)) {
      const row = node('div');
      row.className = 'message';
      row.append(node('strong', message.role || 'Imported text'));
      const metadata = [date(message.timestamp), message.id && 'Message ' + message.id,
        message.parent && 'Parent ' + message.parent].filter(Boolean);
      if (metadata.length) row.append(node('p', metadata.join(' · ')));
      row.append(node('pre', message.text));
      list.append(row);
    }
    count += 25;
    more.hidden = count >= record.messages.length;
  };
  more.onclick = show;
  const original = node('details');
  original.append(node('summary', 'Original source data'));
  original.addEventListener('toggle', () => {
    if (original.open && original.children.length === 1) {
      original.append(node('pre', typeof record.original === 'string' ? record.original :
        JSON.stringify(record.original, null, 2)));
    }
  });
  article.append(list, more, original);
  show();
  article.hidden = false;
}

function download(blob) {
  const link = node('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'NOVA-memory-' + new Date().toISOString().replaceAll(':', '-') + '.novabak';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 30000);
}
$('backup').onsubmit = event => {
  event.preventDefault();
  const password = $('backup-password').value;
  const confirmation = $('backup-confirm').value;
  const selected = $('selected-backup').checked;
  $('backup').reset();
  void run(async signal => {
    if (password !== confirmation) throw Error('Backup passphrases must match.');
    const records = [];
    let size = 0;
    const encoder = new TextEncoder();
    for (const id of await keys(db, 'records')) {
      signal.throwIfAborted();
      const record = await getRecord(id);
      if (selected && !record.bookmark) continue;
      size += encoder.encode(JSON.stringify(record)).length + 1;
      if (size > 64 * MiB - 100) throw Error('Backup exceeds the 64 MiB limit. Export a selection.');
      records.push(record);
    }
    status('Encrypting backup…');
    const blob = await exportBackup(password, records);
    signal.throwIfAborted();
    download(blob);
    await write(db, [await historyOp(`Requested download of encrypted backup with ${records.length} conversations.`)]);
    status('Encrypted backup download requested. Check your Downloads folder.');
  }, true);
};
$('restore').onsubmit = event => {
  event.preventDefault();
  const file = $('backup-file').files[0];
  const password = $('restore-password').value;
  $('restore').reset();
  void run(async signal => {
    status('Verifying backup integrity…');
    const incoming = await readBackup(password, file);
    const existing = new Set(await keys(db, 'records'));
    const operations = [];
    let duplicates = 0, conflicts = 0;
    for (const record of incoming) {
      signal.throwIfAborted();
      if (existing.has(record.id)) {
        const local = await getRecord(record.id);
        if (local && local.hash === record.hash) duplicates++;
        else conflicts++;
        continue;
      }
      operations.push(await recordOp(record, true));
      existing.add(record.id);
    }
    if (!confirm(`Restore ${operations.length} conversations? ${duplicates} duplicates and ${conflicts} conflicts will be skipped.`)) {
      status('Restore cancelled.');
      return;
    }
    const message = `Restored ${operations.length} conversations. Skipped ${duplicates} duplicates and ${conflicts} conflicts.`;
    operations.push(await historyOp(message));
    await write(db, operations, signal);
    status(message);
  }, true);
};
$('rotate').onsubmit = event => {
  event.preventDefault();
  const current = $('current-password').value;
  const password = $('new-password').value;
  const confirmation = $('new-confirm').value;
  $('rotate').reset();
  void run(async signal => {
    if (password !== confirmation) throw Error('New passphrases must match.');
    const next = await wrap(password, await unwrap(current, config));
    await write(db, [{ store: 'settings', id: 'vault', value: next }, await historyOp('Changed archive passphrase.')], signal);
    config = next;
    status('Archive passphrase updated. Existing backups keep their own passphrases.');
  });
};
$('erase').onclick = () => {
  if (prompt('Type DELETE to permanently erase this device archive. Files you previously exported will remain.') !== 'DELETE') return;
  void run(async signal => {
    await write(db, ['records', 'history', 'settings'].map(store => ({ store })), signal);
    config = null;
  }).then(() => { if (!config && key) void lock('Local archive deleted.'); });
};
for (const button of document.querySelectorAll('[data-view]')) {
  button.onclick = () => void run(() => view(button.dataset.view), true);
}
try {
  if (!crypto.subtle || !navigator.locks) throw Error('Open the archive in a current browser on localhost or HTTPS.');
  db = await database();
  config = await read(db, 'settings', 'vault');
  setGate();
  $('offline').textContent = 'Checking offline availability…';
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => {
    $('offline').textContent = 'Offline app shell cached on this browser.';
  }).catch(() => {
    $('offline').textContent = 'Offline cache unavailable. Keep the local launcher running.';
  });
} catch (error) {
  $('gate-help').textContent = error.message;
}
