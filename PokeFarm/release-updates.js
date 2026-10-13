'use strict';

const RELEASE_API = 'https://api.github.com/repos/RaullPereira/PokeFarm/releases/latest';
const RELEASE_PAGE = 'https://github.com/RaullPereira/PokeFarm/releases/tag/';

// Releases estáveis: v3.1, 3.1.0 ou 3.1.0+build. Metadados não alteram precedência.
function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if (!match) return null;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3] || 0)];
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function newerRelease(data, currentVersion) {
  if (!data || typeof data.draft !== 'boolean' || typeof data.prerelease !== 'boolean') throw new Error('Invalid release');
  if (data.draft || data.prerelease) return null;
  const current = parseVersion(currentVersion);
  const latest = parseVersion(data.tag_name);
  if (!current || !latest) throw new Error('Invalid version');
  const different = latest.findIndex((part, i) => part !== current[i]);
  return {
    newer: different !== -1 && latest[different] > current[different],
    version: latest.join('.'),
    // Nunca abre uma URL fornecida pelo renderer ou pelo conteúdo da release.
    url: RELEASE_PAGE + encodeURIComponent(data.tag_name),
  };
}

function createReleaseChecker({ currentVersion, fetch: fetchRelease = globalThis.fetch,
  now = Date.now, notifiedVersions = [], persistNotified = () => {},
  onAvailable = () => {}, onChange = () => {} }) {
  const notified = new Set(Array.isArray(notifiedVersions) ? notifiedVersions.filter(v => typeof v === 'string') : []);
  let state = { status: 'idle', currentVersion, release: null };
  let pending = null;
  let nextCheck = 0;
  const setState = patch => { state = { ...state, ...patch }; onChange({ ...state }); };

  async function performCheck() {
    setState({ status: 'checking' });
    try {
      const response = await fetchRelease(RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PokeFarm-update-check' },
        credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 404) {
        setState({ status: 'unpublished', release: null });
      } else if (!response.ok) {
        if (response.status === 403 || response.status === 429) {
          const retry = response.headers.get('retry-after');
          const retryAt = retry && /^\d+$/.test(retry) ? now() + Number(retry) * 1000 : Date.parse(retry);
          const resetAt = Number(response.headers.get('x-ratelimit-reset')) * 1000;
          nextCheck = Math.max(nextCheck, Number.isFinite(retryAt) ? retryAt : 0, Number.isFinite(resetAt) ? resetAt : 0);
        }
        throw new Error('GitHub unavailable');
      } else {
        const result = newerRelease(await response.json(), currentVersion);
        const update = result?.newer ? { version: result.version, url: result.url } : null;
        setState({ status: !result ? 'unpublished' : update ? 'available' : 'current', release: update });
        if (update && !notified.has(update.version)) {
          notified.add(update.version);
          try { persistNotified([...notified]); } catch (_) { /* a sessão ainda evita avisos repetidos */ }
          try { onAvailable(update); } catch (_) { /* o aviso permanece na interface */ }
        }
      }
    } catch (_) {
      // Preserva uma atualização já encontrada quando a internet cai.
      setState({ status: 'error' });
    }
    return { ...state };
  }

  return {
    getState: () => ({ ...state }),
    check() {
      if (pending) return pending;
      if (now() < nextCheck) return Promise.resolve({ ...state });
      nextCheck = now() + 60_000;
      pending = performCheck().finally(() => { pending = null; });
      return pending;
    },
  };
}

module.exports = { createReleaseChecker };
