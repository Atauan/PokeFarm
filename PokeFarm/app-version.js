'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const STABLE_TAG = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Só consulta o checkout local; nunca busca tags na rede nem altera manifests. */
function resolveVersion({ fallbackVersion, isPackaged = false, releaseVersion,
  root = path.resolve(__dirname, '..') }) {
  if (isPackaged) return fallbackVersion;
  if (releaseVersion) {
    if (!STABLE_TAG.test(releaseVersion) || releaseVersion.startsWith('v')) throw new Error('Invalid release version');
    return releaseVersion;
  }
  // Também aceita .git como arquivo (worktrees), sem herdar um repo pai por engano.
  if (!fs.existsSync(path.join(root, '.git'))) return fallbackVersion;
  const git = (...args) => execFileSync('git', ['--no-optional-locks', '-C', root, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 3000,
  }).trim();
  try {
    const tags = git('tag', '--merged', 'HEAD', '--list').split(/\r?\n/).filter(tag => STABLE_TAG.test(tag));
    if (!tags.length) return fallbackVersion;
    const description = git('describe', '--tags', '--long', '--abbrev=7',
      ...tags.flatMap(tag => ['--match', tag]), 'HEAD');
    const match = /^v?(\d+\.\d+\.\d+)-(\d+)-g([a-f0-9]+)$/.exec(description);
    if (!match) return fallbackVersion;
    const [, version, distance, hash] = match;
    const metadata = distance === '0' ? [] : [distance, `g${hash}`];
    if (git('status', '--porcelain', '--untracked-files=normal')) metadata.push('dirty');
    return version + (metadata.length ? `+${metadata.join('.')}` : '');
  } catch (_) {
    // Git ausente, histórico raso sem tags ou código baixado como ZIP.
    return fallbackVersion;
  }
}
module.exports = { resolveVersion };
