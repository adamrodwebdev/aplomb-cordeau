#!/usr/bin/env node
/**
 * Copies in the built files this repository does not hold: the Aplomb Estoc typeface and the
 * Cordeau's GLB models. They live in the private repository named by assets.lock.json, which pins
 * the commit to read and each file's size and SHA-256. Every file is checked (size, SHA-256 and
 * signature) before it is written; any problem stops the run, and every problem is named.
 *
 *   node tools/fetch-assets.mjs                   GitHub API, token in PRIVATE_ASSETS_TOKEN
 *   node tools/fetch-assets.mjs --local           a local clone, ../private-assets by default
 *   node tools/fetch-assets.mjs --local=<dir>     a local clone somewhere else
 *   node tools/fetch-assets.mjs --check           only checks the files already in place
 *   node tools/fetch-assets.mjs --local --relock  rewrites the lock from the clone's HEAD
 *
 * No dependencies: Node 20 or later. The token is sent in a header only, and never printed.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_FILE = path.join(ROOT, 'assets.lock.json');

/** The limits of what the lock may say, checked at the door */
const LIMITS = Object.freeze({
  lockBytes: 64 * 1024,
  files: 64,
  pathChars: 200,
  fileBytes: 50 * 1024 * 1024,
  tokenChars: 255,
  timeoutMs: 60_000,
});

const REPOSITORY = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
/** Relative, forward slashes, no segment that starts with a dot (so no `..`), no empty segment */
const SAFE_PATH = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;
const TOKEN = /^[A-Za-z0-9_]+$/;

/** What each kind of file must start with: the allow-list of extensions */
const SIGNATURES = Object.freeze({
  '.woff2': (bytes) => (ascii(bytes, 0, 4) === 'wOF2' ? [] : ['is not a WOFF2 file (no wOF2 signature)']),
  '.glb': (bytes) => {
    if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'glTF') return ['is not a GLB file (no glTF signature)'];
    const problems = [];
    if (bytes.readUInt32LE(4) !== 2) problems.push(`is glTF version ${bytes.readUInt32LE(4)}, not 2`);
    if (bytes.readUInt32LE(8) !== bytes.length) problems.push(`declares ${bytes.readUInt32LE(8)} bytes in its header but has ${bytes.length}`);
    return problems;
  },
});

class LockError extends Error {}

function ascii(bytes, start, end) {
  return bytes.length >= end ? bytes.toString('latin1', start, end) : '';
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readString(record, key, pattern, where) {
  const value = Object.hasOwn(record, key) ? record[key] : undefined;
  if (typeof value !== 'string' || value.length > LIMITS.pathChars || !pattern.test(value)) {
    throw new LockError(`${where}: "${key}" is missing or not valid`);
  }
  return value;
}

function readSize(record, where) {
  const value = Object.hasOwn(record, 'size') ? record.size : undefined;
  if (!Number.isSafeInteger(value) || value < 1 || value > LIMITS.fileBytes) {
    throw new LockError(`${where}: "size" must be a whole number of bytes from 1 to ${LIMITS.fileBytes}`);
  }
  return value;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The lock, read whole and checked before anything is fetched */
async function readLock() {
  const info = await stat(LOCK_FILE).catch(() => null);
  if (info === null) throw new LockError('assets.lock.json is missing');
  if (info.size > LIMITS.lockBytes) throw new LockError(`assets.lock.json is over ${LIMITS.lockBytes} bytes`);
  let raw;
  try {
    raw = JSON.parse(await readFile(LOCK_FILE, 'utf8'));
  } catch {
    throw new LockError('assets.lock.json is not valid JSON');
  }
  if (!isPlainObject(raw) || raw.version !== 1) throw new LockError('assets.lock.json: "version" must be 1');
  const repository = readString(raw, 'repository', REPOSITORY, 'assets.lock.json');
  const commit = readString(raw, 'commit', COMMIT, 'assets.lock.json');
  const folder = readString(raw, 'folder', SAFE_PATH, 'assets.lock.json');
  const list = Object.hasOwn(raw, 'files') ? raw.files : undefined;
  if (!Array.isArray(list) || list.length < 1 || list.length > LIMITS.files) {
    throw new LockError(`assets.lock.json: "files" must list 1 to ${LIMITS.files} files`);
  }
  const seen = new Set();
  const files = list.map((entry, index) => {
    const where = `assets.lock.json, file ${index + 1}`;
    if (!isPlainObject(entry)) throw new LockError(`${where}: not an object`);
    const target = readString(entry, 'path', SAFE_PATH, where);
    const source = readString(entry, 'source', SAFE_PATH, where);
    const extension = path.posix.extname(target);
    if (!Object.hasOwn(SIGNATURES, extension) || path.posix.extname(source) !== extension) {
      throw new LockError(`${where}: only ${Object.keys(SIGNATURES).join(' and ')} files, the same on both sides`);
    }
    if (seen.has(target)) throw new LockError(`${where}: ${target} is listed twice`);
    seen.add(target);
    return Object.freeze({ path: target, source, size: readSize(entry, where), sha256: readString(entry, 'sha256', SHA256, where), extension });
  });
  return Object.freeze({ repository, commit, folder, files });
}

/** A path from the lock, resolved under its base and refused if it would leave it */
function inside(base, relative) {
  const resolved = path.resolve(base, ...relative.split('/'));
  if (!resolved.startsWith(base + path.sep)) throw new LockError(`${relative} leaves ${base}`);
  return resolved;
}

/** Every problem with one file's bytes, or none */
function problemsOf(bytes, file) {
  const problems = [];
  if (bytes.length !== file.size) problems.push(`is ${bytes.length} bytes, the lock says ${file.size}`);
  const digest = sha256(bytes);
  if (digest !== file.sha256) problems.push(`has SHA-256 ${digest}, the lock says ${file.sha256}`);
  return problems.concat(SIGNATURES[file.extension](bytes));
}

/** Reads a response body, refusing more bytes than the lock allows */
async function readCapped(response, cap) {
  if (response.body === null) throw new Error('came back empty');
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > cap) throw new Error(`the server sends more than the ${cap} bytes expected`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

/** The GitHub API source: the file's raw bytes at the pinned commit */
function apiSource(lock) {
  const token = process.env.PRIVATE_ASSETS_TOKEN;
  if (typeof token !== 'string' || token === '') {
    throw new LockError('PRIVATE_ASSETS_TOKEN is not set: give this step the secret, or run with --local');
  }
  if (token.length > LIMITS.tokenChars || !TOKEN.test(token)) {
    throw new LockError('PRIVATE_ASSETS_TOKEN does not look like a GitHub token (its value is not shown)');
  }
  return {
    describe: `${lock.repository} at ${lock.commit.slice(0, 7)} (GitHub API)`,
    async read(file) {
      const encoded = `${lock.folder}/${file.source}`.split('/').map(encodeURIComponent).join('/');
      const url = `https://api.github.com/repos/${lock.repository}/contents/${encoded}?ref=${lock.commit}`;
      let response;
      try {
        response = await fetch(url, {
          headers: {
            Accept: 'application/vnd.github.raw',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'aplomb-cordeau-fetch-assets',
          },
          redirect: 'error',
          signal: AbortSignal.timeout(LIMITS.timeoutMs),
        });
      } catch (error) {
        // Only the error's name and code: its message could quote the request
        const code = error instanceof Error && typeof error.cause?.code === 'string' ? ` ${error.cause.code}` : '';
        throw new Error(`could not be fetched (${error instanceof Error ? error.name : 'network error'}${code})`);
      }
      if (response.status === 401) throw new Error('was refused: the token is not valid or has expired (401)');
      if (response.status === 403 || response.status === 404) {
        throw new Error(`was not found at ${lock.commit.slice(0, 7)}, or the token cannot read ${lock.repository} (${response.status})`);
      }
      if (!response.ok) throw new Error(`could not be fetched (HTTP ${response.status})`);
      return readCapped(response, file.size);
    },
  };
}

/** The local source: a clone of the private repository, read from its working tree */
function localSource(lock, directory) {
  return {
    describe: `${directory} (local clone)`,
    async read(file) {
      const source = inside(directory, `${lock.folder}/${file.source}`);
      const info = await stat(source).catch(() => null);
      if (info === null || !info.isFile()) throw new Error(`is missing from ${source}: pull the private clone`);
      if (info.size !== file.size) {
        throw new Error(`is ${info.size} bytes in ${source}, the lock says ${file.size}: is the clone at ${lock.commit.slice(0, 7)}?`);
      }
      return readFile(source);
    },
  };
}

/** Writes through a partial file, so a stopped run never leaves half a file in place */
async function place(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true });
  const partial = `${target}.part`;
  await writeFile(partial, bytes);
  await rename(partial, target);
}

async function existing(target, file) {
  const bytes = await readFile(target).catch(() => null);
  return bytes !== null && problemsOf(bytes, file).length === 0;
}

function git(directory, args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
}

/** Rewrites the lock from the clone's HEAD: run after a new file version is pushed there */
async function relock(lock, directory) {
  const commit = git(directory, ['rev-parse', 'HEAD']);
  if (!COMMIT.test(commit)) throw new LockError(`${directory} has no readable HEAD commit`);
  if (git(directory, ['status', '--porcelain', '--', lock.folder]) !== '') {
    throw new LockError(`${directory}/${lock.folder} has uncommitted changes: commit and push them first`);
  }
  const files = [];
  for (const file of lock.files) {
    const bytes = await readFile(inside(directory, `${lock.folder}/${file.source}`));
    const signature = SIGNATURES[file.extension](bytes);
    if (signature.length > 0) throw new LockError(`${file.source} ${signature.join('; ')}`);
    files.push({ path: file.path, source: file.source, size: bytes.length, sha256: sha256(bytes) });
  }
  const next = { version: 1, repository: lock.repository, commit, folder: lock.folder, files };
  await writeFile(LOCK_FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`assets.lock.json now reads ${lock.repository} at ${commit.slice(0, 7)}. Check that this commit is pushed.`);
}

/** The command line: an allow-list of flags */
function readArguments(argv) {
  const options = { mode: 'api', directory: path.resolve(ROOT, '..', 'private-assets'), relock: false };
  for (const argument of argv) {
    if (argument === '--local') options.mode = 'local';
    else if (argument.startsWith('--local=') && argument.length > 8 && argument.length <= 500) {
      options.mode = 'local';
      options.directory = path.resolve(argument.slice(8));
    } else if (argument === '--check') options.mode = 'check';
    else if (argument === '--relock') options.relock = true;
    else throw new LockError(`unknown argument; use --local, --local=<dir>, --check or --relock`);
  }
  if (options.relock && options.mode !== 'local') throw new LockError('--relock needs --local');
  return options;
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const lock = await readLock();
  if (options.relock) return relock(lock, options.directory);

  const failures = [];
  if (options.mode === 'check') {
    for (const file of lock.files) {
      const bytes = await readFile(inside(ROOT, file.path)).catch(() => null);
      const problems = bytes === null ? ['is missing: run node tools/fetch-assets.mjs --local'] : problemsOf(bytes, file);
      for (const problem of problems) failures.push(`${file.path} ${problem}`);
      if (problems.length === 0) console.log(`ok       ${file.path}`);
    }
  } else {
    const source = options.mode === 'local' ? localSource(lock, options.directory) : apiSource(lock);
    console.log(`Reading ${lock.files.length} files from ${source.describe}`);
    for (const file of lock.files) {
      const target = inside(ROOT, file.path);
      if (await existing(target, file)) {
        console.log(`ok       ${file.path} (already in place)`);
        continue;
      }
      try {
        const bytes = await source.read(file);
        const problems = problemsOf(bytes, file);
        if (problems.length > 0) {
          for (const problem of problems) failures.push(`${file.path} ${problem}`);
          continue;
        }
        await place(target, bytes);
        console.log(`copied   ${file.path} (${file.size} bytes)`);
      } catch (error) {
        failures.push(`${file.path} ${error instanceof Error ? error.message : 'could not be read'}`);
      }
    }
  }
  if (failures.length > 0) {
    console.error(`\nFAILED: ${failures.length} problem(s), nothing is deployable until they are fixed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`All ${lock.files.length} files verified (size, SHA-256, signature).`);
}

main().catch((error) => {
  console.error(`FAILED: ${error instanceof Error ? error.message : 'unexpected error'}`);
  process.exitCode = 1;
});
