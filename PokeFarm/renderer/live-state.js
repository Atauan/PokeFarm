'use strict';

// Duas confirmações seguidas evitam fechar o player em quedas breves da transmissão.
function nextLiveState(previous, status, wasOpen) {
  if (!['online', 'offline'].includes(status)) status = 'unknown';
  const offlineCount = status === 'offline' ? (previous?.offlineCount || 0) + 1 : 0;
  const open = status === 'online' ||
    (wasOpen && (status === 'unknown' || offlineCount < 2));
  return { status, offlineCount, open };
}
