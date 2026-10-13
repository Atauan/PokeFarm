'use strict';

// Leitor compartilhado por Electron e WebKit. Lê a prancheta, o histórico e os
// bônus recebidos pelo jogo; não abre painéis, reseta contadores ou envia comandos.
function installGameSessionReader() {
  if (window.top !== window || !/(^|\.)pokeidle\.io$/.test(location.hostname) || window.__pfReadSessionSummary) return;
  let balls = [];
  let items = null;
  let loadingPrices = false;
  let retryPricesAt = 0;
  let socket = null;
  let boostState = null;
  let boostTypes = new Map();
  let serverOffset = 0;
  let captureRules = null;
  let loadingCaptureRules = false;
  let retryCaptureRulesAt = 0;
  const ivKeys = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'];
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  const factor = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  const text = value => typeof value === 'string' ? value.slice(0, 100) : '';
  const read = key => {
    try {
      const raw = localStorage.getItem(key);
      return raw && raw.length < 100000 ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  };

  // O estado chega em deltas: campo ausente não mudou, null remove e cheio reinicia.
  // Guarda apenas nick e os campos de bônus usados no resumo, sem a coleção da conta.
  function updateBoostState(update) {
    if (!update || typeof update !== 'object' || Array.isArray(update)) return;
    if (update.cheio || !boostState || (update.nick && update.nick !== boostState.nick)) boostState = {};
    if (Object.hasOwn(update, 'nick')) boostState.nick = text(update.nick);
    if (number(update.servidorAgora)) serverOffset = Date.now() - update.servidorAgora;
    if (Object.hasOwn(update, 'loja')) boostState.loja = update.loja ? {
      boosts: Object.fromEntries(['captura', 'shiny', 'loot'].map(key => [key, number(update.loja.boosts?.[key])])),
    } : null;
    if (Object.hasOwn(update, 'kick')) boostState.kick = update.kick ? {
      pct: update.kick.pct,
      bonus: Object.fromEntries(['captura', 'shiny'].map(key => [key, number(update.kick.bonus?.[key])])),
    } : null;
    if (Object.hasOwn(update, 'bonusXp')) {
      const bonus = update.bonusXp;
      boostState.bonusXp = bonus && Array.isArray(bonus.partes) && bonus.partes.length <= 64 ? {
        tr: factor(bonus.tr), pk: factor(bonus.pk),
        partes: bonus.partes.map(part => ({ tr: part?.tr ?? 1, pk: part?.pk ?? 1, ate: number(part?.ate) })),
      } : null;
    }
  }

  function boostTotals(nick) {
    if (!boostState || boostState.nick?.toLowerCase() !== nick.toLowerCase()) return null;
    const now = Date.now() - serverOffset;
    const xp = key => {
      const bonus = boostState.bonusXp;
      if (!bonus || !factor(bonus[key])) return null;
      // O total do servidor inclui guild, eventos e outras fontes. Remove só as
      // parcelas vencidas desde o pacote, como a faixa de XP do próprio jogo.
      let total = bonus[key];
      for (const part of bonus.partes) {
        if (!factor(part[key])) return null;
        if (part.ate > 0 && part.ate <= now) total /= part[key];
      }
      return factor(total);
    };
    const other = key => {
      if (!boostState.loja) return null;
      let total = 1;
      if (boostState.loja.boosts[key] > now) {
        total = boostTypes.get(key);
        if (!factor(total)) return null;
      }
      const kick = boostState.kick;
      if (kick?.bonus[key] > now) {
        if (typeof kick.pct !== 'number' || !Number.isFinite(kick.pct) || kick.pct < 0) return null;
        total *= 1 + kick.pct / 100;
      }
      return factor(total);
    };
    return { xpTreinador: xp('tr'), xpPokemon: xp('pk'), captura: other('captura'), shiny: other('shiny'), loot: other('loot') };
  }

  // Catálogos vêm no welcome; os bônus mudam também nos pacotes de estado.
  // Nunca guarda tokens, cookies ou mensagens de autenticação.
  if (window.WebSocket) {
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(target, args, newTarget) {
        const ws = Reflect.construct(target, args, newTarget);
        try {
          const url = new URL(String(args[0]), location.href);
          if (url.hostname === location.hostname && url.pathname === '/') {
            socket = ws;
            boostState = null;
            boostTypes = new Map();
            serverOffset = 0;
            ws.addEventListener('message', event => {
              if (ws !== socket || typeof event.data !== 'string' || !/"t"\s*:\s*"(welcome|estado)"/.test(event.data)) return;
              try {
                const message = JSON.parse(event.data);
                if (message.t === 'welcome') {
                  if (Array.isArray(message.catalogoBolas)) {
                    balls = message.catalogoBolas.slice(0, 64).map(row => ({ id: row.id, price: number(row.priceGold) }));
                  }
                  boostTypes = new Map((Array.isArray(message.tiposBoost) ? message.tiposBoost : [])
                    .slice(0, 64).filter(row => row && typeof row.chave === 'string')
                    .map(row => [row.chave, factor(row.mult)]));
                }
                if (message.t === 'welcome' || message.t === 'estado') updateBoostState(message.estado);
              } catch (_) { /* espera o próximo pacote válido */ }
            });
          }
        } catch (_) { /* preserva a conexão original */ }
        return ws;
      },
    });
  }

  function loadPrices() {
    if (items || loadingPrices || Date.now() < retryPricesAt) return;
    loadingPrices = true;
    // Mesmas correções públicas de preço usadas pela prancheta do jogo, inclusive
    // revives. Módulos já carregados pelo jogo são reutilizados pelo navegador.
    Promise.all([
      fetch('/assets/items.json').then(response => { if (!response.ok) throw new Error('catalog'); return response.json(); }),
      import('/shared/ajuste-item-espelho.mjs'),
      import('/shared/venda-npc-item.mjs'),
    ]).then(([catalog, adjustment, pricing]) => {
      if (!Array.isArray(catalog.items)) throw new Error('catalog');
      items = new Map(catalog.items.map(item => {
        const adjusted = adjustment.ajustarItemEspelho(pricing.normalizarNpcPriceItem(item));
        return [String(adjusted.id), number(adjusted.npcPrice)];
      }));
    }).catch(() => { retryPricesAt = Date.now() + 60000; })
      .finally(() => { loadingPrices = false; });
  }

  function loadCaptureRules() {
    if (captureRules || loadingCaptureRules || Date.now() < retryCaptureRulesAt) return;
    loadingCaptureRules = true;
    // Reutiliza os módulos públicos já carregados pelo jogo. A nota depende das
    // bases corrigidas e do piso da linhagem; não usa uma espécie genérica.
    const catalogs = ['creatures', 'creatures-novos', 'creatures-outland-novos', 'creatures-audit-overrides'];
    Promise.all([
      Promise.all(catalogs.map(async (name, index) => {
        const response = await fetch(`/assets/${name}.json`);
        if (response.status === 404 && index > 0) return {};
        if (!response.ok) throw new Error('species catalog');
        return response.json();
      })),
      import('/shared/nota-pokemon.mjs'),
      import('/shared/outland.mjs'),
      import('/shared/herdar-base-outland.mjs'),
      import('/shared/evolucoes-cruzadas.mjs'),
      import('/shared/megas.mjs'),
      import('/shared/linhagem-nota.mjs'),
    ]).then(([catalogs, notes, outland, bases, evolutions, megas, lineage]) => {
      if (!Array.isArray(catalogs[0].creatures)) throw new Error('species catalog');
      const list = catalogs.slice(0, 3).flatMap(catalog => catalog.creatures || []);
      outland.aplicarRemapOutlandLista(list);
      const byId = new Map(list.map(species => [species.pokeId, species]));
      for (const override of catalogs[3].overrides || []) {
        const species = byId.get(override.pokeId);
        if (!species) continue;
        for (const key of ['baseHp', 'baseAtk', 'baseDef', 'baseSpAtk', 'baseSpDef', 'baseSpeed']) {
          if (factor(override[key])) species[key] = override[key];
        }
      }
      bases.herdarBaseOutland(list);
      evolutions.aplicarCadeiasTruncadas(list);
      for (const species of list) {
        if (outland.isEspelhoFantasmaPokeId(species.pokeId)) byId.delete(species.pokeId);
        if (outland.isOutlandPokeId(species.pokeId)) species.evolvesToId = 0;
      }
      evolutions.aplicarEvolucoesEntreGeracoes(list);
      for (const species of megas.criarEspeciesMega(list)) {
        list.push(species); byId.set(species.pokeId, species);
      }
      lineage.anotarLinhagemDaNota(list, id => byId.get(id), megas.elosMegaDaNota(list));
      captureRules = { score: notes.notaDePokemon, byId,
        byName: new Map([...byId.values()].map(species => [species.name?.toLowerCase(), species])) };
    }).catch(() => { retryCaptureRulesAt = Date.now() + 60000; })
      .finally(() => { loadingCaptureRules = false; });
  }

  function captureDetails(row) {
    const ivs = row.ivs && typeof row.ivs === 'object' && !Array.isArray(row.ivs)
      ? Object.fromEntries(ivKeys.map(key => [key, Number.isInteger(row.ivs[key]) && row.ivs[key] >= 1 && row.ivs[key] <= 32 ? row.ivs[key] : null]))
      : null;
    const ivTotal = ivs && Object.values(ivs).every(value => value != null)
      ? Object.values(ivs).reduce((sum, value) => sum + value, 0) : null;
    const quality = factor(row.quality);
    const potency = Number.isInteger(row.potencia) && row.potencia >= 1 && row.potencia <= 5 ? row.potencia : null;
    let score = null;
    const species = captureRules?.byId.get(row.speciesId) || captureRules?.byName.get(row.nome.toLowerCase());
    const hasBases = species && ['baseHp', 'baseAtk', 'baseDef', 'baseSpAtk', 'baseSpDef', 'baseSpeed'].every(key => factor(species[key]));
    if (hasBases && ivTotal != null && quality != null && potency != null) {
      try {
        const value = captureRules.score({ ivs, quality, potencia: potency, shiny: row.shiny === true }, species);
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10) score = value;
      } catch (_) { /* mantém os atributos mesmo se a fórmula estiver indisponível */ }
    }
    return { name: text(row.nome), level: number(row.level), shiny: row.shiny === true, at: number(row.em),
      score, potency, quality, ivTotal, ivs };
  }

  const dropNames = {
    bossTokens: 'Boss Tokens', fragChave: 'Fragmentos de chave', fragShiny: 'Fragmentos de Shiny Stone',
    fragBicicleta: 'Fragmentos de bicicleta', fragMega: 'Fragmentos de Mega Stone',
    fragMegaShiny: 'Fragmentos de Mega Shiny Stone', tmPeca: 'Peças de TM', tmPecaAoe: 'Peças de TM AoE',
    ticketMistico: 'Tickets místicos', fragOvoShiny: 'Fragmentos de Ovo Shiny',
  };
  window.__pfReadSessionSummary = () => {
    const app = document.querySelector('#app');
    const nick = text(document.querySelector('#tr-nick')?.textContent?.trim());
    if (!app || app.classList.contains('hidden') || !nick || nick === '—') return { status: 'login' };
    const session = read(`sessao-hunt:${nick.toLowerCase()}`);
    if (!session || typeof session !== 'object' || Array.isArray(session)) return { status: 'waiting', nick };
    loadPrices();
    const result = { status: socket && socket.readyState !== 1 ? 'disconnected' : 'ready', nick, ms: number(session.ms) };
    result.boostTotals = boostTotals(nick);
    for (const key of ['capturas', 'shinies', 'shiniesVistos', 'abates', 'gold', 'xpTreinador', 'xpPokemon']) result[key] = number(session[key]);
    result.drops = Object.entries(dropNames).map(([key, name]) => ({ name, count: number(session[key]) })).filter(row => row.count > 0);
    result.costs = { total: 0, unpriced: 0 };
    result.consumed = {};
    for (const group of ['bolas', 'pocoes', 'revives', 'tokens']) {
      result.consumed[group] = 0;
      const counts = session[group];
      if (!counts || typeof counts !== 'object' || Array.isArray(counts)) continue;
      for (const [id, value] of Object.entries(counts).slice(0, 64)) {
        const count = number(value);
        result.consumed[group] += count;
        if (!count) continue;
        const price = group === 'tokens' ? 0 : group === 'bolas'
          ? balls.find(ball => String(ball.id) === id)?.price : items?.get(id);
        if (price == null || price === 0) result.costs.unpriced += count;
        else result.costs.total += price * count;
      }
    }
    const history = read(`capturas-hist:${nick.toLowerCase()}`);
    const captures = (Array.isArray(history) ? history : []).slice(0, 100)
      .filter(row => row && typeof row.nome === 'string');
    if (captures.some(row => row.ivs)) loadCaptureRules();
    result.captureCount = captures.length;
    result.captures = captures.map(captureDetails)
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.at - a.at).slice(0, 12);
    result.boosts = Array.from(document.querySelectorAll('#tr-ativos .tr-ativo'))
      // O jogo também usa estas linhas para convites de vínculo e avisos de live.
      // Só o estado "ativo" significa que o jogador está recebendo o bônus.
      .filter(row => (!row.classList.contains('kick') || row.classList.contains('kk-ativo'))
        && (!row.classList.contains('twitch') || row.classList.contains('tw-ativo')))
      .slice(0, 20)
      .map(row => ({ name: text(row.querySelector('.tr-ativo-nome')?.textContent?.trim()),
        remaining: text(row.querySelector('.tr-ativo-tempo')?.textContent?.trim()) }))
      .filter(row => row.name);
    return result;
  };
}

if (typeof process !== 'undefined' && process.versions?.electron && typeof require === 'function') {
  const { webFrame } = require('electron');
  // executeInMainWorld serializa a função; imports dinâmicos precisam do contexto
  // normal de script do WebFrame para resolver os módulos públicos do jogo.
  webFrame.executeJavaScript(`(${installGameSessionReader.toString()})()`).catch(() => {});
} else if (typeof window !== 'undefined') {
  installGameSessionReader();
} else if (typeof module !== 'undefined') {
  module.exports = { installGameSessionReader };
}
