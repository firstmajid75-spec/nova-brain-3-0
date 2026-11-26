import './vendor/zip.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export const MiB = 1024 * 1024;
export const backupLimit = 64 * MiB;
const recordLimit = 8 * MiB;
const iterations = 600000;
const bytes = length => crypto.getRandomValues(new Uint8Array(length));
const hex = data => Array.from(data, byte => byte.toString(16).padStart(2, '0')).join('');
export async function digest(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(value)))));
}

export async function derive(password, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function seal(key, purpose, value) {
  const iv = bytes(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(purpose) },
    key, encoder.encode(JSON.stringify(value)));
  return { iv, data };
}
export async function open(key, purpose, { iv, data }) {
  const result = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(purpose) }, key, data);
  return JSON.parse(decoder.decode(result));
}

export async function exportBackup(password, records) {
  const salt = bytes(16);
  const key = await derive(password, salt);
  const envelope = await seal(key, 'NOVA backup v1', { records });
  const blob = new Blob(['NOVABAK1', salt, envelope.iv, envelope.data], { type: 'application/octet-stream' });
  if (blob.size > backupLimit) throw Error('Backup exceeds the 64 MiB limit. Export a selection.');
  return blob;
}
export async function readBackup(password, file) {
  if (file.size < 52 || file.size > backupLimit) throw Error('Unsupported backup size.');
  const header = new Uint8Array(await file.slice(0, 36).arrayBuffer());
  if (decoder.decode(header.slice(0, 8)) !== 'NOVABAK1') throw Error('Unsupported backup format.');
  const key = await derive(password, header.slice(8, 24));
  let payload;
  try {
    payload = await open(key, 'NOVA backup v1', { iv: header.slice(24), data: await file.slice(36).arrayBuffer() });
  } catch {
    throw Error('Incorrect backup password or damaged backup.');
  }
  if (!Array.isArray(payload.records)) throw Error('Invalid backup records.');
  for (const record of payload.records) {
    if (!record || !/^[a-f0-9]{64}$/.test(record.id) || !/^[a-f0-9]{64}$/.test(record.hash) ||
        typeof record.title !== 'string' || !Array.isArray(record.messages) ||
        !Array.isArray(record.categories) || record.categories.some(v => typeof v !== 'string') ||
        typeof record.note !== 'string' || typeof record.bookmark !== 'boolean' ||
        record.messages.some(m => !m || typeof m.text !== 'string' || typeof m.role !== 'string')) {
      throw Error('Invalid conversation in backup.');
    }
  }
  return payload.records;
}

export function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nova-archive-v1', 1);
    request.onupgradeneeded = () => {
      for (const name of ['settings', 'records', 'history']) request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function read(db, name, id) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(name).objectStore(name).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function keys(db, name) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(name).objectStore(name).getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function write(db, operations, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...new Set(operations.map(op => op.store))], 'readwrite');
    const cancel = () => { try { tx.abort(); } catch {} };
    signal?.addEventListener('abort', cancel, { once: true });
    tx.oncomplete = () => { signal?.removeEventListener('abort', cancel); resolve(); };
    tx.onabort = () => {
      signal?.removeEventListener('abort', cancel);
      reject(tx.error || new DOMException('Operation cancelled', 'AbortError'));
    };
    for (const { store, id, value, add } of operations) {
      const table = tx.objectStore(store);
      if (id === undefined) table.clear();
      else if (value === undefined) table.delete(id);
      else if (add) table.add(value, id);
      else table.put(value, id);
    }
  });
}

const conversationFile = /^conversations?(?:[-_ ]?\d+)?\.json$/i;
const textFile = /\.(?:html?|md|markdown|txt)$/i;
const sensitive = [
  ['Possible credentials', /\b(?:api[-_ ]?key|access[-_ ]?token|password|authorization:\s*bearer)\s*[:=]|-----BEGIN [A-Z ]*PRIVATE KEY-----/i],
  ['Health', /\b(?:medical|diagnosis|patient|prescription)\b/i],
  ['Family', /\b(?:family|child|relationship)\b/i],
  ['Financial', /\b(?:bank|account number|salary|credit card)\b/i],
  ['Legal', /\b(?:lawsuit|legal|attorney)\b/i],
  ['Confidential', /\b(?:confidential|invention|prototype)\b/i],
];

async function normalize(raw, source, format) {
  if (format === 'json' && (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      !raw.mapping || typeof raw.mapping !== 'object' || Array.isArray(raw.mapping))) {
    throw Error('Expected a ChatGPT conversation with a message mapping.');
  }
  const title = typeof raw.title === 'string' && raw.title ? raw.title : source;
  const sourceId = typeof raw.conversation_id === 'string' ? raw.conversation_id :
    typeof raw.id === 'string' ? raw.id : null;
  const messages = format === 'json' ? Object.entries(raw.mapping).flatMap(([id, node]) => {
    const message = node?.message;
    if (!message) return [];
    const content = message.content;
    const parts = Array.isArray(content?.parts) ? content.parts : [content?.text];
    return [{
      id, messageId: message.id ?? null, parent: node.parent ?? null, children: node.children ?? [],
      role: typeof message.author?.role === 'string' ? message.author.role : '',
      timestamp: message.create_time ?? null,
      text: parts.filter(part => typeof part === 'string').join('\n'),
    }];
  }) : [{ role: '', timestamp: null, text: raw.text }];
  const original = format === 'json' ? raw : raw.text;
  const canonical = format === 'json' ? original : [title, original];
  const hash = await digest(canonical);
  const id = sourceId ? await digest(['chatgpt', sourceId]) : hash;
  const flags = sensitive.filter(([, pattern]) => pattern.test(title) ||
    messages.some(message => pattern.test(message.text))).map(([label]) => label);
  return { id, hash, title, source, sourceId, format, messages, original, flags, categories: [], note: '', bookmark: false };
}

// Stream a top-level ChatGPT object or array of objects. Accumulate at most one conversation.
async function* jsonObjects(stream, signal) {
  let mode = '', state = 'start', record = '', depth = 0, quoted = false, escaped = false;
  const reader = stream.pipeThrough(new TextDecoderStream('utf-8', { fatal: true })).getReader();
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      let offset = depth ? 0 : -1;
      for (let i = 0; i < value.length; i++) {
        const c = value[i];
        if (depth) {
          if (quoted) {
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === '"') quoted = false;
          } else if (c === '"') quoted = true;
          else if (c === '{' || c === '[') depth++;
          else if (c === '}' || c === ']') depth--;
          if (!depth) {
            record += value.slice(offset, i + 1);
            if (record.length > recordLimit) throw Error('A conversation exceeds the size limit.');
            const parsed = JSON.parse(record);
            record = '';
            offset = -1;
            state = mode === 'array' ? 'separator' : 'end';
            yield parsed;
          }
          continue;
        }
        if (/^[ \t\r\n]$/.test(c)) continue;
        if (state === 'start' && c === '[') { mode = 'array'; state = 'first'; continue; }
        if (mode === 'array' && (state === 'first' || state === 'separator') && c === ']') {
          state = 'end'; continue;
        }
        if (state === 'separator' && c === ',') { state = 'next'; continue; }
        if (c === '{' && ['start', 'first', 'next'].includes(state)) {
          depth = 1;
          offset = i;
          continue;
        }
        throw Error('Malformed conversation JSON.');
      }
      if (offset >= 0) {
        record += value.slice(offset);
        if (record.length > recordLimit) throw Error('A conversation exceeds the size limit.');
      }
    }
    if (state !== 'end' || depth) throw Error('Incomplete conversation JSON.');
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function htmlConversationData(text) {
  const marker = /\b(?:var|let|const)\s+jsonData\s*=\s*(?=\[)/.exec(text);
  if (!marker) return null;
  const start = marker.index + marker[0].length;
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (!depth) return text.slice(start, i + 1);
    }
  }
  throw Error('Incomplete conversation data in the HTML export.');
}

async function* parse(stream, name, signal, json) {
  if (json) {
    for await (const raw of jsonObjects(stream, signal)) yield await normalize(raw, name, 'json');
    return;
  }
  const reader = stream.pipeThrough(new TextDecoderStream('utf-8', { fatal: true })).getReader();
  let text = '';
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      text += value;
      if (text.length > recordLimit) throw Error('Text document exceeds the size limit.');
    }
    const html = /\.html?$/i.test(name);
    const embedded = html ? htmlConversationData(text) : null;
    if (embedded !== null) {
      const json = new Blob([embedded]).stream();
      for await (const raw of jsonObjects(json, signal)) yield await normalize(raw, name, 'json');
      return;
    }
    const record = await normalize({ text }, name, html ? 'html' : 'text');
    // Keep HTML as untrusted source text. Never instantiate its DOM or load its resources.
    yield record;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function* importFile(file, signal, textOnly = false) {
  if (textOnly || /\.json$/i.test(file.name) || textFile.test(file.name)) {
    if (file.size > (textOnly || textFile.test(file.name) ? recordLimit : 1024 * MiB)) {
      throw Error('Selected file exceeds the size limit.');
    }
    yield* parse(file.stream(), file.name, signal, !textOnly && /\.json$/i.test(file.name));
    return;
  }
  if (!/\.zip$/i.test(file.name)) throw Error('Choose a ZIP, JSON, HTML, Markdown or text file.');
  if (file.size > 8 * 1024 * MiB) throw Error('ZIP exceeds the 8 GiB input limit.');
  const reader = new globalThis.zip.ZipReader(new globalThis.zip.BlobReader(file), { useWebWorkers: false });
  try {
    const supported = [];
    let count = 0;
    let declaredTotal = 0;
    for await (const entry of reader.getEntriesGenerator()) {
      signal.throwIfAborted();
      if (++count > 25000) throw Error('ZIP has too many entries.');
      const name = entry.filename;
      if (/[\\\u0000-\u001f]/.test(name) || /^(?:\/|[a-z]:)/i.test(name) || name.split('/').includes('..')) {
        throw Error('ZIP contains an unsafe path.');
      }
      if (entry.directory) continue;
      const base = name.split('/').at(-1);
      if (!conversationFile.test(base) && !/^chat\.html?$/i.test(base)) continue;
      if (entry.encrypted || !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) {
        throw Error('Unsupported ZIP entry.');
      }
      declaredTotal += entry.uncompressedSize;
      if (declaredTotal > 1024 * MiB || entry.uncompressedSize > 250 * Math.max(1, entry.compressedSize)) {
        throw Error('ZIP exceeds safe decompression limits.');
      }
      supported.push(entry);
    }
    const json = supported.filter(entry => conversationFile.test(entry.filename.split('/').at(-1)));
    const entries = json.length ? json : supported;
    if (!entries.length) throw Error('No supported ChatGPT conversation files found in the ZIP.');
    for (const entry of entries) {
      const limit = Math.min(entry.uncompressedSize, json.length ? 1024 * MiB : recordLimit);
      let expanded = 0;
      const stream = new TransformStream({
        transform(chunk, controller) {
          expanded += chunk.byteLength;
          if (expanded > limit) throw Error('ZIP entry exceeded its decompression limit.');
          controller.enqueue(chunk);
        },
      });
      const extracting = entry.getData(stream.writable, {
        signal, checkSignature: true, useWebWorkers: false,
      }).then(() => null, error => error);
      try {
        yield* parse(stream.readable, entry.filename, signal, Boolean(json.length));
        const error = await extracting;
        if (error) throw error;
      } finally {
        await stream.readable.cancel().catch(() => {});
        await extracting;
      }
    }
  } finally {
    await reader.close();
  }
}
