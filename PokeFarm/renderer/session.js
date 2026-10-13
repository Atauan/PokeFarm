'use strict';
// A mesma interface é usada no BrowserWindow e no WKWebView nativo.
let nativeRequest = null;
let nativeSequence = 0;
window.pfReceiveSession = response => {
  if (nativeRequest?.id === response.id) {
    clearTimeout(nativeRequest.timer);
    nativeRequest.resolve(response.data);
    nativeRequest = null;
  }
};
const native = window.webkit?.messageHandlers?.pfSummary;
const bridge = window.pfSummary || {
  get: () => new Promise((resolve, reject) => {
    const id = ++nativeSequence;
    const timer = setTimeout(() => { nativeRequest = null; reject(new Error('timeout')); }, 5000);
    nativeRequest = { id, resolve, timer };
    native?.postMessage({ action: 'get', id });
  }),
  open: () => native?.postMessage({ action: 'open' }),
  close: () => native?.postMessage({ action: 'close' }),
};
const $ = id => document.getElementById(id);
const fmt = value => Number.isFinite(value) ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value) : '—';
let accounts = [];
let selected = '';
let busy = false;
const boostTypes = [
  ['xpTreinador', 'XP do treinador'], ['xpPokemon', 'XP dos Pokémon'],
  ['captura', 'Captura'], ['shiny', 'Chance de shiny'], ['loot', 'Loot / drops'],
];
const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const multiplier = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
const attributeDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtAttribute = value => Number.isFinite(value) ? attributeDecimal.format(value) : '—';
function renderBoostTotals(totals) {
  let missing = false;
  $('boost-totals').replaceChildren(...boostTypes.map(([key, label]) => {
    const value = totals?.[key];
    const known = Number.isFinite(value) && value > 0;
    missing ||= !known;
    const row = document.createElement('div');
    const name = document.createElement('dt'); name.textContent = label;
    const amount = document.createElement('dd');
    const total = document.createElement('strong');
    total.textContent = known ? `${percent.format(Math.round((value - 1) * 1000) / 10)}%` : '—';
    const factor = document.createElement('small'); factor.textContent = known ? `×${multiplier.format(value)}` : '';
    if (known && value > 1) row.className = 'boosted';
    amount.append(total, factor); row.append(name, amount);
    return row;
  }));
  $('boost-totals-note').textContent = missing
    ? 'Aguardando os valores que faltam do jogo…'
    : 'Bônus combinados por multiplicação. Captura e shiny respeitam os limites do jogo.';
}
function chips(id, rows, empty) {
  $(id).replaceChildren();
  for (const value of rows) {
    const span = document.createElement('span');
    span.className = 'chip'; span.textContent = value; $(id).append(span);
  }
  if (!rows.length) {
    const span = document.createElement('span'); span.className = 'empty'; span.textContent = empty; $(id).append(span);
  }
}
function renderCaptures(data) {
  const signature = JSON.stringify([selected, data.captureCount, data.captures]);
  // Preserva a rolagem e o andamento do brilho entre atualizações sem novas capturas.
  if ($('captures').dataset.signature === signature) return;
  const captureCount = data.captureCount ?? data.captures?.length ?? 0;
  $('captures-note').textContent = captureCount
    ? `Maior nota primeiro · ${data.captures?.length || 0} de ${fmt(captureCount)} no histórico. Atributos da captura.` : '';
  $('captures').replaceChildren();
  for (const row of data.captures || []) {
    const li = document.createElement('li'); li.className = 'capture-row';
    if (Number.isFinite(row.score) && row.score >= 3.5) li.classList.add('high-score');
    if (row.shiny) {
      li.classList.add('shiny');
      const tag = document.createElement('span'); tag.className = 'capture-tag'; tag.textContent = '✦ SHINY';
      li.append(tag);
    }
    const header = document.createElement('div'); header.className = 'capture-header';
    const name = document.createElement('strong'); name.className = 'capture-name'; name.textContent = row.name;
    const score = document.createElement('strong'); score.className = 'capture-score'; score.textContent = `Nota ${fmtAttribute(row.score)}`;
    header.append(name, score);
    const attributes = document.createElement('p'); attributes.className = 'capture-attributes';
    attributes.textContent = `Nv. ${fmt(row.level)} · P${fmt(row.potency)} · IV ${fmt(row.ivTotal)}/192 · Q ${fmtAttribute(row.quality)}`;
    li.append(header, attributes); $('captures').append(li);
  }
  if (!data.captures?.length) {
    const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'O histórico de capturas está vazio.'; $('captures').append(li);
  }
  $('captures').dataset.signature = signature;
}
function render() {
  const data = accounts.find(account => account.id === selected)?.data;
  const ready = data && ['ready', 'disconnected'].includes(data.status);
  $('summary-data').hidden = !ready;
  $('summary-status').textContent = !accounts.length ? 'Adicione uma conta do Pokeidle para acompanhar.'
    : data?.status === 'login' ? 'Entre nesta conta no Pokeidle para ver o resumo.'
      : !ready ? 'Aguardando os dados de Sessão do jogo…'
        : data.status === 'disconnected' ? 'Jogo desconectado · últimos dados disponíveis'
          : 'Dados do jogo · atualização a cada 2 segundos';
  if (!ready) return;
  $('nickname').textContent = data.nick;
  const minutes = Math.floor((data.ms || 0) / 60000);
  $('duration').textContent = `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}min de sessão`;
  $('captured').textContent = fmt(data.capturas); $('shinies').textContent = fmt(data.shinies);
  $('gold').textContent = fmt(data.gold);
  $('cost').textContent = `${data.costs?.unpriced ? '≥ ' : ''}${fmt(data.costs?.total)}`;
  $('details').textContent = `${fmt(data.abates)} abates · ${fmt(data.shiniesVistos)} shinies vistos · ${fmt(data.xpTreinador)} XP treinador · ${fmt(data.xpPokemon)} XP Pokémon`;
  const spent = data.consumed;
  $('cost-note').textContent = `Reposição em ouro a preço de loja.${data.costs?.unpriced ? ` ${fmt(data.costs.unpriced)} consumíveis sem preço conhecido, fora do total.` : ''}${spent ? ` Usados: ${fmt(spent.bolas)} bolas, ${fmt(spent.pocoes)} poções, ${fmt(spent.revives)} revives e ${fmt(spent.tokens)} tokens.` : ''}`;
  renderBoostTotals(data.boostTotals);
  chips('boosts', (data.boosts || []).map(row => `${row.name}${row.remaining ? ` · ${row.remaining}` : ''}`), 'Nenhum bônus ativo informado.');
  chips('drops', (data.drops || []).map(row => `${row.name} × ${fmt(row.count)}`), 'Nenhum drop raro nesta sessão.');
  renderCaptures(data);
}
async function refresh() {
  if (busy || document.hidden) return;
  busy = true;
  try {
    const snapshot = await bridge.get();
    accounts = Array.isArray(snapshot?.accounts) ? snapshot.accounts : [];
    if (!accounts.some(account => account.id === selected)) selected = snapshot?.selected || accounts[0]?.id || '';
    if (!accounts.some(account => account.id === selected)) selected = accounts[0]?.id || '';
    // Não recria o select durante o uso do teclado ou com o menu aberto.
    const signature = JSON.stringify(accounts.map(({ id, name }) => [id, name]));
    if ($('account-select').dataset.signature !== signature) {
      $('account-select').replaceChildren(...accounts.map(account => new Option(account.name, account.id)));
      $('account-select').dataset.signature = signature;
    }
    $('account-select').value = selected;
    render();
  } catch (_) { $('summary-status').textContent = 'Não foi possível atualizar. Tentando novamente…'; }
  finally { busy = false; }
}
$('account-select').addEventListener('change', event => { selected = event.target.value; render(); });
$('summary-close').addEventListener('click', () => bridge.close());
$('summary-open').addEventListener('click', () => bridge.open());
document.addEventListener('keydown', event => { if (event.key === 'Escape') bridge.close(); });
function syncVisibility() {
  document.body.classList.toggle('summary-hidden', document.hidden);
  if (!document.hidden) void refresh();
}
document.addEventListener('visibilitychange', syncVisibility);
setInterval(refresh, 2000);
syncVisibility();
