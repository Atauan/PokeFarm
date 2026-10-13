'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

function parts(value) {
  if (typeof value !== 'string' || !/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return null;
  const numbers = value.replace(/^v/, '').split('.').map(Number);
  return numbers.every(Number.isSafeInteger) ? numbers : null;
}
function compare(a, b) {
  const left = parts(a), right = parts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
function requireVersion(version) {
  if (!parts(version) || version.startsWith('v')) throw new Error(`Invalid version: ${version}`);
}
const marker = sha => `<!-- pokefarm-commit:${sha} -->`;
const belongsTo = (release, sha) => release.target_commitish === sha && String(release.body).includes(marker(sha));

function planRelease({ baseVersion, tags, releases, sha, isAncestor = () => false }) {
  requireVersion(baseVersion);
  const descendant = releases.filter(r => !r.draft && !r.prerelease && parts(r.tag_name)
    && /^[a-f0-9]{40}$/.test(r.target_commitish) && belongsTo(r, r.target_commitish) && r.target_commitish !== sha)
    .sort((a, b) => compare(b.tag_name, a.tag_name))
    .find(r => isAncestor(sha, r.target_commitish));
  if (descendant) return { version: parts(descendant.tag_name).join('.'), tag: descendant.tag_name, build: false };
  const existing = releases.filter(r => !r.prerelease && parts(r.tag_name) && belongsTo(r, sha))
    .sort((a, b) => compare(b.tag_name, a.tag_name))[0];
  if (existing) return { version: parts(existing.tag_name).join('.'), tag: existing.tag_name, build: existing.draft };
  const known = [baseVersion, ...tags, ...releases.filter(r => !r.prerelease).map(r => r.tag_name)]
    .filter(parts).sort(compare);
  const next = parts(known.at(-1));
  next[2]++;
  if (!Number.isSafeInteger(next[2])) throw new Error('Patch version overflow');
  const version = next.join('.');
  return { version, tag: `v${version}`, build: true };
}

function stampVersion(root, version) {
  requireVersion(version);
  const packageFile = path.join(root, 'PokeFarm/package.json');
  const plistFile = path.join(root, 'Info.plist');
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  let plist = fs.readFileSync(plistFile, 'utf8');
  for (const key of ['CFBundleVersion', 'CFBundleShortVersionString']) {
    const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
    if (!pattern.test(plist)) throw new Error(`Missing ${key} in Info.plist`);
    plist = plist.replace(pattern, (_match, before, after) => before + version + after);
  }
  pkg.version = version;
  fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + '\n');
  fs.writeFileSync(plistFile, plist);
  const lockFile = path.join(root, 'PokeFarm/package-lock.json');
  if (fs.existsSync(lockFile)) {
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    lock.version = version;
    if (lock.packages?.['']) lock.packages[''].version = version;
    fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
  }
}

async function releaseFiles(directory, version) {
  const names = [`PokeFarm-Setup-${version}.exe`, `PokeFarm-Portable-${version}.exe`,
    `PokeFarm-${version}-arm64.dmg`, `PokeFarm-${version}-x64.dmg`, `PokeFarm-Swift-${version}-universal.zip`].sort();
  const files = names.map(name => path.join(directory, name));
  for (const file of files) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
      throw new Error(`Missing release artifact: ${path.basename(file)}`);
    }
  }
  const sums = [];
  for (const file of files) {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    sums.push(`${hash.digest('hex')}  ${path.basename(file)}`);
  }
  const checksumFile = path.join(directory, 'SHA256SUMS.txt');
  fs.writeFileSync(checksumFile, sums.join('\n') + '\n');
  return [...files, checksumFile];
}

async function publishRelease({ api, version, sha, directory }) {
  requireVersion(version);
  const files = await releaseFiles(directory, version);
  const tag = `v${version}`;
  const releases = await api.list('/releases');
  const tagCommit = await api.tagCommit(tag);
  if (tagCommit && tagCommit !== sha) throw new Error(`${tag} belongs to another commit`);
  let release = releases.find(r => r.tag_name === tag);
  if (release && !belongsTo(release, sha)) throw new Error(`${tag} belongs to another commit or was created manually`);
  if (release && !release.draft) return 'already-published';
  if (!release) {
    const notes = await api.request('POST', '/releases/generate-notes', { tag_name: tag, target_commitish: sha });
    release = await api.request('POST', '/releases', {
      tag_name: tag, target_commitish: sha, name: `PokeFarm ${version}`,
      body: `${marker(sha)}\n\n${notes.body || ''}\n\nInstaladores Electron para Windows e macOS, app Swift universal para macOS e SHA256SUMS.txt anexados.`,
      draft: true, prerelease: false, make_latest: 'false',
    });
  }
  // Rascunhos de uma tentativa interrompida podem ter uploads incompletos.
  const previousAssets = await api.list(`/releases/${release.id}/assets`);
  for (const file of files) {
    const previous = previousAssets.find(a => a.name === path.basename(file));
    if (previous) await api.request('DELETE', `/releases/assets/${previous.id}`);
    await api.upload(release.id, file);
  }
  const uploaded = await api.list(`/releases/${release.id}/assets`);
  for (const file of files) {
    const asset = uploaded.find(a => a.name === path.basename(file));
    if (!asset || asset.state !== 'uploaded' || asset.size !== fs.statSync(file).size) {
      throw new Error(`Incomplete upload: ${path.basename(file)}`);
    }
  }
  const newerPublished = releases.some(r => !r.draft && !r.prerelease && parts(r.tag_name) && compare(r.tag_name, version) > 0);
  await api.request('PATCH', `/releases/${release.id}`, { draft: false, make_latest: newerPublished ? 'false' : 'true' });
  return 'published';
}

function createGitHubApi(repository, token, fetch = globalThis.fetch) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || !token) throw new Error('Missing GitHub repository or token');
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'PokeFarm-release-workflow' };
  async function send(url, options) {
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
    if (!response.ok) {
      const error = new Error(`GitHub request failed: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  const api = {
    request: (method, route, body) => send(`https://api.github.com/repos/${repository}${route}`, {
      method, signal: AbortSignal.timeout(30_000), headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    async list(route) {
      const entries = [];
      for (let page = 1; ; page++) {
        const batch = await api.request('GET', `${route}?per_page=100&page=${page}`);
        if (!Array.isArray(batch)) throw new Error('Invalid GitHub list response');
        entries.push(...batch);
        if (batch.length < 100) return entries;
      }
    },
    async tagCommit(tag) {
      let ref;
      try { ref = await api.request('GET', `/git/ref/tags/${encodeURIComponent(tag)}`); }
      catch (error) { if (error.status === 404) return null; throw error; }
      let object = ref.object;
      for (let depth = 0; object.type === 'tag' && depth < 10; depth++) {
        object = (await api.request('GET', `/git/tags/${object.sha}`)).object;
      }
      if (object.type !== 'commit') throw new Error('Tag does not resolve to a commit');
      return object.sha;
    },
    upload: (releaseId, file) => send(`https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets?name=${encodeURIComponent(path.basename(file))}`, {
      method: 'POST', body: fs.createReadStream(file), duplex: 'half', signal: AbortSignal.timeout(10 * 60_000),
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(fs.statSync(file).size) },
    }),
  };
  return api;
}

async function main() {
  const root = path.resolve(__dirname, '../..');
  const mode = process.argv[2];
  if (mode === 'stamp') { stampVersion(root, process.env.RELEASE_VERSION); return; }
  const sha = process.env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(sha || '') || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Releases require a commit on main');
  const api = createGitHubApi(process.env.GITHUB_REPOSITORY, process.env.GH_TOKEN);
  if (mode === 'prepare') {
    const tags = execFileSync('git', ['tag', '--list'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
    const baseVersion = JSON.parse(fs.readFileSync(path.join(root, 'PokeFarm/package.json'))).version;
    const plan = planRelease({ baseVersion, tags, releases: await api.list('/releases'), sha,
      isAncestor: (older, newer) => {
        try { execFileSync('git', ['merge-base', '--is-ancestor', older, newer], { cwd: root, stdio: 'pipe' }); return true; }
        catch (error) { if (error.status === 1) return false; throw error; }
      },
    });
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${plan.version}\ntag=${plan.tag}\nbuild=${plan.build}\n`);
    console.log(`${plan.tag}: ${plan.build ? 'build and publish' : 'commit already covered by a published release; skipping'}`);
  } else if (mode === 'publish') {
    console.log(await publishRelease({ api, version: process.env.RELEASE_VERSION, sha, directory: path.resolve(process.env.ASSET_DIR) }));
  } else throw new Error('Use prepare, stamp or publish');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
