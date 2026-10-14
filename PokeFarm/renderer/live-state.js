'use strict';

// Duas confirmações seguidas evitam fechar o player em quedas breves da transmissão.
// Status 'unknown' (frequente na Kick devido a bloqueios Cloudflare na API) abre a live para exibir o player.
function nextLiveState(previous, status, wasOpen) {
  if (!['online', 'offline'].includes(status)) status = 'unknown';
  const offlineCount = status === 'offline' ? (previous?.offlineCount || 0) + 1 : 0;
  const open = status === 'online' ||
    (status === 'unknown') ||
    (wasOpen && offlineCount < 2);
  return { status, offlineCount, open };
}
