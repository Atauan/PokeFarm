'use strict';
// PokeFarm — Injetor autocontido do addon /hunt for PokeIdle
// Totalmente embutido, sem dependência de require('fs') ou require('path') em runtime.

const HUNT_CSS = "/* PokeIdle Hunt — o botão /hunt no \"Em campo\" e o painel \"Onde caçar?\".\n   As cores são as variáveis do próprio jogo (com reserva), para parecer da casa. */\n\n/* O /hunt é o botão \"Mega Evoluir\" do jogo, mais curto: o mesmo dourado com o fio de luz em\n   cima (#ffe9a8 → #d09a17), a mesma moldura e o texto escuro. */\n.pih-btn {\n  display: inline-block; padding: 4px 10px; border: 0; border-radius: 6px; cursor: pointer;\n  background: linear-gradient(180deg, #ffe9a8 0 4px, #d09a17 4px 100%);\n  box-shadow: inset 0 0 0 2px var(--mad-linha, #480e1e), 0 1px 0 var(--mad-luz2, #e7a86d);\n  color: #000; text-shadow: 0 1px 0 rgba(255, 255, 255, .35);\n  font: 700 12px/1.2 Tahoma, Verdana, \"Segoe UI\", sans-serif; white-space: nowrap;\n}\n.pih-btn:hover { filter: brightness(1.06); }\n.pih-btn.pih-carregando { animation: pih-pulso 1s ease-in-out infinite; }\n@keyframes pih-pulso { 50% { filter: brightness(1.2); } }\n\n/* A barra fica no fluxo do painel \"Em campo\", entre o título e o card: acompanha a largura da\n   caixa em qualquer tela e nunca cobre o pokémon. */\n.pih-btn.pih-barra {\n  display: block; width: clamp(110px, 55%, 240px); margin: 0 auto 8px; padding: 7px 10px;\n}\n.pih-btn[hidden] { display: none; }\n/* Reserva, quando o jogador apontou o pokémon à mão (layout desconhecido): flutua acima dele. */\n.pih-btn.pih-fixo { position: fixed; z-index: 38; margin: 0; }\n\n/* ---- painel -------------------------------------------------------------------------- */\n.pih-painel {\n  position: fixed; z-index: 38; width: min(640px, calc(100vw - 24px)); max-height: min(78vh, 760px);\n  display: flex; flex-direction: column;\n  font: 500 12.5px/1.35 \"Barlow\", system-ui, sans-serif; color: var(--sobre-mad, #fff6ef);\n  background: linear-gradient(180deg, var(--mad-esc, #914850) 0 10px, var(--mad, #bd6951) 10px calc(100% - 10px), var(--mad-base, #722c3f) calc(100% - 10px));\n  border-radius: 9px; padding: 12px 14px 12px;\n  box-shadow: inset 0 0 0 2px var(--mad-linha, #480e1e), inset 0 3px 0 var(--mad-luz, #f1d3b7), 0 10px 30px #0009;\n}\n.pih-cab { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }\n.pih-cab .pih-btn { flex: none; cursor: default; }\n.pih-titulo { flex: 1; min-width: 0; }\n.pih-titulo h3 { margin: 0; font-size: 15px; font-weight: 800; letter-spacing: .3px; text-transform: uppercase; }\n.pih-credito { margin-left: 8px; font-size: 10.5px; font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--sobre-mad, #fff6ef); opacity: .38; }\n.pih-titulo small { display: block; color: var(--sobre-mad-dim, #f5cdb9); font-size: 12px; font-weight: 600; }\n.pih-fechar {\n  flex: none; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; font: 800 15px/1 system-ui;\n  color: var(--sobre-mad, #fff6ef); background: var(--vao, #33202b); border: 0;\n  box-shadow: inset 0 0 0 2px var(--mad-linha, #480e1e);\n}\n.pih-vao {\n  background: var(--vao, #33202b); border-radius: 6px; padding: 8px 10px;\n  box-shadow: inset 0 0 0 2px var(--mad-linha, #480e1e), 0 1px 0 var(--mad-luz2, #e7a86d);\n}\n.pih-stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px 8px; margin-bottom: 8px; }\n.pih-stat b { display: block; font-size: 10px; color: var(--vao-dim, #c9a9b4); font-weight: 700; }\n.pih-stat span { font-weight: 700; font-variant-numeric: tabular-nums; }\n.pih-stat i { font-style: normal; color: var(--verde, #6fd08a); font-size: 10.5px; margin-left: 3px; }\n\n.pih-bonus { margin-bottom: 8px; font-size: 12px; display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; }\n.pih-bonus-total { margin-left: auto; font-weight: 800; color: var(--verde, #6fd08a); }\n.pih-ctrl { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; margin-bottom: 8px; }\n.pih-seg { display: inline-flex; border-radius: 6px; overflow: hidden; box-shadow: inset 0 0 0 2px var(--mad-linha, #480e1e); }\n.pih-seg button {\n  border: 0; cursor: pointer; padding: 5px 10px; font: 700 12px/1 \"Barlow\", system-ui, sans-serif;\n  color: var(--sobre-mad-dim, #f5cdb9); background: var(--vao, #33202b);\n}\n.pih-seg button.on { color: var(--rx-luz, #ffdef0); background: linear-gradient(180deg, var(--rx-clr, #e77ad2), var(--rx-esc, #8d49b8)); }\n.pih-ctrl label { display: inline-flex; gap: 5px; align-items: center; cursor: pointer; font-weight: 600; }\n\n.pih-ajuda {\n  margin-left: auto; flex: none; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; cursor: pointer;\n  font: 800 13px/1 Tahoma, Verdana, \"Segoe UI\", sans-serif; color: #000;\n  background: linear-gradient(180deg, #ffe9a8 0 3px, #d09a17 3px 100%);\n  box-shadow: inset 0 0 0 2px var(--mad-linha, #480e1e);\n}\n.pih-ajuda:hover { filter: brightness(1.06); }\n.pih-ajuda[aria-expanded=\"true\"] { filter: brightness(.9); }\n.pih-dica { margin: -2px 0 8px; font-size: 12px; }\n.pih-dica[hidden] { display: none; }\n.pih-melhor { margin-bottom: 8px; display: flex; gap: 10px; align-items: center; }\n.pih-melhor .pih-coroa { font-size: 20px; }\n.pih-melhor strong { font-size: 15px; }\n.pih-melhor .pih-dim { color: var(--vao-dim, #c9a9b4); }\n\n.pih-lista { overflow: auto; padding: 0; min-height: 80px; }\n.pih-tab { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }\n.pih-tab th {\n  position: sticky; top: 0; z-index: 1; background: var(--vao2, #462b39); color: var(--vao-dim, #c9a9b4);\n  font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; text-align: right; padding: 6px 8px; white-space: nowrap;\n}\n.pih-tab th:nth-child(-n+2), .pih-tab td:nth-child(-n+2) { text-align: left; }\n.pih-tab td { padding: 5px 8px; text-align: right; border-top: 1px solid var(--vao2, #462b39); white-space: nowrap; }\n.pih-tab tr.pih-top td { background: #6fd08a1f; }\n.pih-tab tr.pih-bloq td { opacity: .5; }\n.pih-tab td.pih-hunt { white-space: normal; }\n.pih-tab td.pih-hunt b { font-weight: 700; }\n.pih-tab td.pih-hunt small { display: block; color: var(--vao-dim, #c9a9b4); font-size: 10.5px; }\n.pih-pos { color: var(--vao-dim, #c9a9b4); width: 1%; }\n.pih-ok { color: var(--verde, #6fd08a); }\n.pih-alerta { color: var(--laranja, #f0a03c); }\n.pih-perigo { color: var(--vermelho-luz, #ffc9bd); }\n.pih-medido { color: var(--verde, #6fd08a); cursor: help; margin-right: 2px; }\n.pih-aprox { color: var(--vao-dim, #c9a9b4); cursor: help; }\n.pih-mais { width: 100%; margin-top: 6px; padding: 6px; cursor: pointer; border: 0; border-radius: 6px;\n  font: 700 12px/1 \"Barlow\", system-ui, sans-serif; color: var(--sobre-mad, #fff6ef); background: var(--vao2, #462b39); }\n.pih-rodape { margin-top: 8px; font-size: 11px; color: var(--sobre-mad-dim, #f5cdb9); }\n.pih-carga { display: grid; place-items: center; gap: 8px; padding: 26px 0; color: var(--vao-dim, #c9a9b4); }\n.pih-carga::before {\n  content: \"\"; width: 26px; height: 26px; border-radius: 50%;\n  border: 3px solid var(--vao2, #462b39); border-top-color: var(--rx-clr, #e77ad2); animation: pih-gira .7s linear infinite;\n}\n@keyframes pih-gira { to { transform: rotate(1turn); } }\n.pih-erro { color: var(--vermelho-luz, #ffc9bd); padding: 12px 0; }\n\n/* ---- aviso (verificação \"onde está seu pokémon ativo?\") ------------------------------- */\n.pih-aviso {\n  position: fixed; left: 16px; bottom: 44px; z-index: 38; max-width: 340px;\n  display: flex; gap: 10px; align-items: center;\n  font: 600 12.5px/1.35 \"Barlow\", system-ui, sans-serif; color: var(--sobre-mad, #fff6ef);\n  background: var(--vao, #33202b); border-radius: 8px; padding: 10px 12px;\n  box-shadow: inset 0 0 0 2px var(--mad-linha, #480e1e), 0 0 0 2px var(--mad-luz2, #e7a86d), 0 8px 20px #0008;\n}\n.pih-aviso .pih-btn { flex: none; font-size: 10.5px; cursor: default; }\n.pih-aviso button.pih-x { margin-left: auto; background: none; border: 0; color: inherit; cursor: pointer; font-size: 14px; }\n.pih-mirando, .pih-mirando * { cursor: crosshair !important; }\n.pih-alvo { outline: 3px dashed var(--seta, #ffd166) !important; outline-offset: 2px; }\n";

function installPokeidleHunt() {
  if (typeof window === 'undefined' || !/(^|\.)pokeidle\.io$/.test(window.location.hostname)) return;

  const runner = `(function() {
    if (window.__pfHuntLoaded) return;
    window.__pfHuntLoaded = true;
    try {
      if (window.localStorage.getItem('pf.gameHunt') === 'false') return;
    } catch (_) {}

    const injectStyle = () => {
      if (document.getElementById('pih-ui-css')) return;
      const s = document.createElement('style');
      s.id = 'pih-ui-css';
      s.textContent = ${JSON.stringify(HUNT_CSS)};
      (document.head || document.documentElement)?.appendChild(s);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectStyle, { once: true });
    } else {
      injectStyle();
    }

    // Scripts do /hunt for PokeIdle
    // Escuta o WebSocket do jogo sem mexer em nada.
//
// Roda no contexto da página (world MAIN), antes do cliente do jogo abrir o socket. Só
// acrescenta um ouvinte de mensagem: nada é enviado, nada é alterado, o jogo continua
// recebendo exatamente o que recebia. O que chega é repassado ao barramento da extensão
// (\`PIH.on\`), que as outras partes (catálogo, geometria, tela) assinam.
(function (root) {
  'use strict';
  const PIH = (root.__pokeidleHunt ??= {});
  if (PIH.hookInstalado) return;
  PIH.hookInstalado = true;

  // ---- barramento de eventos -------------------------------------------------------------
  const ouvintes = new Map();
  // O último de cada tipo fica guardado: quem assina depois (a tela carrega mais tarde que o
  // welcome, às vezes) recebe na hora em vez de esperar o próximo.
  const ultimo = new Map();
  const RETIDOS = new Set(['welcome', 'estado']);

  PIH.on = (tipo, fn) => {
    if (!ouvintes.has(tipo)) ouvintes.set(tipo, new Set());
    ouvintes.get(tipo).add(fn);
    if (ultimo.has(tipo)) {
      try { fn(ultimo.get(tipo)); } catch (err) { console.error('[pokeidle-hunt]', err); }
    }
    return () => ouvintes.get(tipo)?.delete(fn);
  };
  PIH.emit = (tipo, dado) => {
    if (RETIDOS.has(tipo)) ultimo.set(tipo, dado);
    for (const fn of ouvintes.get(tipo) ?? []) {
      try { fn(dado); } catch (err) { console.error('[pokeidle-hunt]', err); }
    }
  };

  // ---- o estado chega em delta ------------------------------------------------------------
  // O jogo manda o quadro inteiro no welcome e depois só o que mudou. A remontagem é a do
  // próprio jogo (\`shared/estado-delta.mjs\`), importada ao vivo; até ela chegar, os pacotes
  // ficam na fila para não perder nenhum delta.
  let mesclar = null;
  const fila = [];
  import(\`\${location.origin}/shared/estado-delta.mjs\`)
    .then((m) => {
      mesclar = m.criarMescladorDeEstado();
      for (const parcial of fila.splice(0)) entregarEstado(parcial);
    })
    .catch((err) => console.error('[pokeidle-hunt] estado-delta indisponível', err));

  function entregarEstado(parcial) {
    if (!mesclar) {
      if (fila.length < 100) fila.push(parcial);
      return;
    }
    const eu = mesclar(parcial);
    if (eu) PIH.emit('estado', eu);
  }

  function aoReceber(ev) {
    if (typeof ev.data !== 'string') return;
    // Só interessam quatro tipos; os pacotes \`campo\` são os mais frequentes (vários por
    // segundo) e são pequenos. Tudo o mais passa direto sem parse.
    const cab = ev.data.slice(0, 40);
    let tipo = null;
    if (cab.includes('"t":"welcome"')) tipo = 'welcome';
    else if (cab.includes('"t":"estado"')) tipo = 'estado';
    else if (cab.includes('"t":"campo.init"')) tipo = 'campo.init';
    else if (cab.includes('"t":"campo"')) tipo = 'campo';
    if (!tipo) return;
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (tipo === 'welcome') {
      // O estado do welcome é o quadro completo (\`cheio\`): zera o mesclador antes.
      PIH.emit('welcome', m);
      if (m.estado) entregarEstado({ ...m.estado, cheio: true });
    } else if (tipo === 'estado') {
      if (m.estado) entregarEstado(m.estado);
    } else {
      PIH.emit(tipo, m);
    }
  }

  // ---- o socket ---------------------------------------------------------------------------
  const Original = root.WebSocket;
  function WebSocketObservado(...args) {
    const ws = new Original(...args);
    try {
      const alvo = new URL(String(args[0]), location.href);
      if (alvo.host === location.host) ws.addEventListener('message', aoReceber);
    } catch { /* URL estranha: não é o socket do jogo */ }
    return ws;
  }
  WebSocketObservado.prototype = Original.prototype;
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) WebSocketObservado[k] = Original[k];
  root.WebSocket = WebSocketObservado;
})(globalThis);

;
// Tudo o que vem do jogo, sempre da versão no ar.
//
// Nada de tabela copiada: as fórmulas são os próprios módulos \`shared/\` do pokeidle.io,
// importados da página, e o catálogo de espécies é remontado a partir dos mesmos JSONs e na
// mesma ordem que o cliente oficial usa (\`carregarCatalogoEspecies\` no app.js deles). Quando
// o jogo muda um golpe, um cooldown ou uma curva de XP, a extensão muda junto no próximo F5.
(function (root) {
  'use strict';
  const PIH = (root.__pokeidleHunt ??= {});

  const SEM_CACHE = { cache: 'no-cache' };
  const url = (caminho) => \`\${location.origin}/\${caminho}\`;
  const importar = (caminho) => import(url(caminho));
  const json = (caminho, opcional = false) =>
    fetch(url(caminho), SEM_CACHE).then((r) => {
      if (r.ok) return r.json();
      if (opcional) return null;
      throw new Error(\`\${caminho}: HTTP \${r.status}\`);
    }).catch((err) => { if (opcional) return null; throw err; });

  /** A versão do cliente, lida da folha de estilo (\`estilo.css?v=1.233.0\`). */
  PIH.versaoDoJogo = () => {
    const link = document.querySelector('link[href*="estilo.css?v="]');
    return link?.getAttribute('href')?.split('v=')[1] ?? null;
  };

  /** Os módulos do jogo que a extensão usa — a mesma lista serve aos testes (scripts/). */
  const MODULOS = {
    cooldown: 'shared/cooldown-golpes.mjs',
    especiais: 'shared/golpes-especiais.mjs',
    planilhas: 'shared/golpes-planilhas.mjs',
    outland: 'shared/outland.mjs',
    baseOutland: 'shared/herdar-base-outland.mjs',
    golpesOrre: 'shared/herdar-golpes-orre.mjs',
    megas: 'shared/megas.mjs',
    evolucoes: 'shared/evolucoes-cruzadas.mjs',
    alias: 'shared/alias-item.mjs',
    tm: 'shared/tm-elemental.mjs',
    recompensa: 'shared/recompensa-hunt.mjs',
    analyser: 'hunt-analyser.mjs',
  };
  const CATALOGOS = {
    cr: 'assets/creatures.json',
    novos: 'assets/creatures-novos.json',
    outlandNovos: 'assets/creatures-outland-novos.json',
    overrides: 'assets/creatures-audit-overrides.json',
    itens: 'assets/items.json',
  };
  PIH.MODULOS_DO_JOGO = MODULOS;
  PIH.CATALOGOS_DO_JOGO = CATALOGOS;

  async function carregarModulos() {
    const pares = await Promise.all(Object.entries(MODULOS).map(async ([k, caminho]) => [k, await importar(caminho)]));
    return Object.fromEntries(pares);
  }

  /**
   * O catálogo de espécies como o cliente monta — só os passos que mexem em combate:
   * stats-base, tipos e golpes. Evolução, teto de captura e valor de mercado ficam de fora.
   */
  function montarCatalogo(mod, fontes) {
    const { cr, novos, outlandNovos, overrides } = fontes;
    const lista = [...(cr?.creatures ?? [])];
    if (novos?.creatures?.length) lista.push(...novos.creatures);
    if (outlandNovos?.creatures?.length) lista.push(...outlandNovos.creatures);
    mod.outland.aplicarRemapOutlandLista(lista);

    for (const o of overrides?.overrides ?? []) {
      const c = lista.find((x) => x.pokeId === o.pokeId);
      if (!c) continue;
      for (const k of ['baseHp', 'baseAtk', 'baseDef', 'baseSpAtk', 'baseSpDef', 'baseSpeed']) {
        if (typeof o[k] === 'number') c[k] = o[k];
      }
      if (Array.isArray(o.attacks)) c.attacks = o.attacks.map((a) => ({ ...a }));
    }

    mod.planilhas.aplicarGolpesDasPlanilhas((id) => lista.filter((c) => c.pokeId === id));
    mod.baseOutland.herdarBaseOutland(lista);
    // Cadeias truncadas antes da injeção dos golpes de 600: é o que tira o ultimate de quem
    // deixou de ser última evolução (Vigoroth, Shelgon), igual ao servidor.
    mod.evolucoes.aplicarCadeiasTruncadas(lista);
    mod.evolucoes.normalizarEvolveLevel600(lista);

    const especies = new Map();
    for (const c of lista) {
      if (mod.outland.isEspelhoFantasmaPokeId(c.pokeId)) continue;
      for (const l of c.loot ?? []) l.name = mod.alias.resolverNomeItem(l.name);
      mod.especiais.injetarGolpesEspeciais(c);
      especies.set(c.pokeId, c);
    }
    mod.golpesOrre.herdarGolpesOrre(lista);
    for (const mega of mod.megas.criarEspeciesMega(lista)) especies.set(mega.pokeId, mega);
    return especies;
  }

  function precosDeItem(itens) {
    const precoItem = new Map();
    for (const i of itens?.items ?? itens ?? []) {
      if (i?.name) precoItem.set(i.name, Number(i.npcPrice) || 0);
    }
    return precoItem;
  }

  // Para os testes montarem o mesmo catálogo fora do navegador.
  PIH._montarCatalogo = montarCatalogo;
  PIH._precosDeItem = precosDeItem;

  let promessa = null;
  /** Carrega uma vez por página; as chamadas seguintes recebem o mesmo resultado. */
  PIH.carregarJogo = () => (promessa ??= (async () => {
    const inicio = performance.now();
    const [mod, cr, novos, outlandNovos, overrides, itens] = await Promise.all([
      carregarModulos(),
      json(CATALOGOS.cr),
      json(CATALOGOS.novos, true),
      json(CATALOGOS.outlandNovos, true),
      json(CATALOGOS.overrides, true),
      json(CATALOGOS.itens, true),
    ]);
    const especies = montarCatalogo(mod, { cr, novos, outlandNovos, overrides });
    const precoItem = precosDeItem(itens);
    return {
      mod,
      especies,
      precoItem,
      versao: PIH.versaoDoJogo(),
      msCarga: Math.round(performance.now() - inicio),
    };
  })().catch((err) => { promessa = null; throw err; }));
})(globalThis);

;
// Motor do "Onde caçar?" — simula o seu pokémon em cada hunt e ordena por XP/h ou ouro/h.
//
// Regras de combate: Pokepédia do jogo (capítulos Combate e Stats) e os módulos \`shared/\`
// importados ao vivo (curva de cooldown, desconto do Speed, efetividade amplificada, XP e ouro
// por abate, multiplicadores de boost). Constantes que o servidor manda no \`welcome\`
// (multiplicadores do selvagem, tabela de tipos) entram por \`ctx.consts\`.
//
// O que NÃO está no cliente e foi medido em jogo (ritmo das ondas, caminhada entre alvos,
// tempo de retarget) fica em MEDIDO, abaixo, e pode ser substituído pela geometria que a
// própria extensão mede enquanto você caça (ver geo.js).
(function (root) {
  'use strict';
  const PIH = (root.__pokeidleHunt ??= {});

  // ---- regras do jogo que o cliente só documenta em texto (Pokepédia > Combate) -----------
  const REGRAS = {
    randMedio: 0.925, // aleatório(0,85–1,00)
    stab: 1.5,
    gapJogadorMs: 900, // intervalo mínimo entre golpes seus
    gapSelvagemS: 1.4, // intervalo mínimo entre golpes dele
    investidaPower: 30,
    investidaCdMs: 2000,
    pisoCdMs: 400, // piso do desconto fixo do IV de SPD
    msPorIvSpd: 10, // −10 ms por ponto de IV de SPD na Investida e no intervalo
    hpCombateMult: 12, // hpDeCombate = máx(24, arred(hp × 12))
    hpCombateMin: 24,
    ivSelvagemMedio: 16, // selvagem: IV sorteado 1–32 por mob
    poderMinimo: 15,
    ladoTmAoe: 11, // Pokepédia > TM: o disco AoE acerta um quadrado 11×11 centrado no pokémon
  };

  // ---- ritmo da hunt: medido em jogo (aprendido com o guia, ajustável por medição própria) --
  const MEDIDO = {
    retargetS: 1.0, // abate → primeiro golpe no próximo alvo
    cicloMinS: 1.8, // piso do ciclo de quem mata instantâneo
    gapOndaS: 2.8, // campo limpo → próxima onda
    msOndaS: 2.6, // jitter da onda repartido entre os mobs
    selvagemSPorTile: 1.9, // velocidade com que o selvagem converge ao herói
    heroiSPorTile: 0.26, // passo do herói
    fBusca: 0.31, // fração da distância média andada por abate
    spawnsPadrao: 15,
    maxSpawns: 16, // o jogo nunca põe mais de 16 selvagens por onda (MAX_MOBS do hunt-analyser)
    distPadrao: 20.6, // tiles — mediana das hunts medidas
    slotSinnohS: 30, // nv>150: reposição por slot
    slotOutrasS: 65,
    nivelOnda: 150, // até aqui a onda é global; acima, por slot
    respawnS: 3, // morte → volta ao jogo (sem contar a corrida)
    amostrasHp: 32, // abates simulados por espécie (IV de HP 1..32)
    maxAtaquesPorAbate: 4000,
    // TM AoE: quantos selvagens cada golpe acerta em média. 2,2 é o medido numa sessão real;
    // com as suas sessões medidas, a extensão recalibra (ver \`calibrarAoe\`).
    aoeAlvosPorGolpe: 2.2,
    aoeAlvosMin: 1,
    aoeAlvosMax: 6,
    aoeMaxEngajados: 15,
  };

  /** O pokémon tem o disco AoE aplicado? (mesma leitura do selo "AoE" do jogo) */
  const temAoe = (pk) => {
    const v = pk?.tmAoe ?? pk?.tm_aoe;
    return v === true || v === 'true' || v === 1;
  };
  const mediana = (xs) => {
    const s = xs.slice().sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };

  /** \`n\` valores espalhados pela distribuição medida (quantis), do mais perto ao mais longe. */
  function quantis(valores, n) {
    const v = valores.slice().sort((a, b) => a - b);
    return Array.from({ length: n }, (_, i) => v[Math.min(v.length - 1, Math.floor(((i + 0.5) / n) * v.length))]);
  }

  /**
   * Todos os multiplicadores de XP ativos agora (Pokepédia > Níveis e XP: eles se MULTIPLICAM):
   * XP Boost (treinador) e XP Boost Pokémon, VIP, Boost da Guild e bônus do ranking da guild — os
   * quatro já na conta \`multXp*\` do jogo —, mais o bônus Twitch, o bônus na Kick, o evento e o
   * Boost dos atrasados.
   */
  function bonusXp(eu, ctx, agora = Date.now()) {
    const tiposBoost = ctx.consts.tiposBoost ?? [];
    const base = {
      pokemon: ctx.mod.analyser.multXpPokemon?.(eu ?? {}, agora, tiposBoost) ?? 1,
      treinador: ctx.mod.analyser.multXpTreinador?.(eu ?? {}, agora, tiposBoost) ?? 1,
    };
    const itens = [];
    const l = eu?.loja ?? {};
    const boostDe = (chave) => (agora < (l.boosts?.[chave] ?? 0) ? tiposBoost.find((b) => b.chave === chave)?.mult ?? 1 : 1);
    if (agora < (l.vipAte ?? 0)) itens.push({ nome: 'VIP', mult: ctx.mod.analyser.VIP_MULT_XP ?? 1.5, ambos: true, base: true });
    if (boostDe('xp') > 1) itens.push({ nome: 'XP Boost', mult: boostDe('xp'), treinador: true, base: true });
    if (boostDe('pokexp') > 1) itens.push({ nome: 'XP Boost Pokémon', mult: boostDe('pokexp'), pokemon: true, base: true });
    if (Number(eu?.guildBonusPct) > 0) itens.push({ nome: 'Ranking da guild', mult: 1 + eu.guildBonusPct / 100, ambos: true, base: true });
    if (agora < (eu?.guild?.boostAte ?? 0)) {
      const m = base.pokemon / itens.filter((i) => i.base && (i.ambos || i.pokemon)).reduce((s, i) => s * i.mult, 1);
      if (m > 1.0001) itens.push({ nome: 'Boost da Guild', mult: m, ambos: true, base: true });
    }
    const extra = { pokemon: 1, treinador: 1 };
    const somar = (item) => {
      itens.push(item);
      if (item.ambos || item.pokemon) extra.pokemon *= item.mult;
      if (item.ambos || item.treinador) extra.treinador *= item.mult;
    };
    const tw = eu?.twitch;
    if (tw?.assistindo && Number(tw.pctAtual) > 0) somar({ nome: 'Twitch', mult: 1 + tw.pctAtual / 100, ambos: true });
    const kk = eu?.kick;
    if (agora < (Number(kk?.bonus?.xp) || 0) && Number(kk?.pct) > 0) somar({ nome: 'Kick', mult: 1 + kk.pct / 100, ambos: true });
    const ev = eu?.evento;
    if (ev && agora < (ev.terminaEm ?? 0)) {
      const tr = Number(ev.xpTreinadorPct) || 0;
      const pk = Number(ev.xpPokemonPct) || 0;
      if (tr && tr === pk) somar({ nome: 'Evento', mult: 1 + tr / 100, ambos: true });
      else {
        if (pk) somar({ nome: 'Evento (pokémon)', mult: 1 + pk / 100, pokemon: true });
        if (tr) somar({ nome: 'Evento (treinador)', mult: 1 + tr / 100, treinador: true });
      }
    }
    const at = l.atrasados;
    if (at && Number(at.mult) > 1 && (eu?.level ?? 0) < (Number(at.alvo) || 0)) somar({ nome: 'Atrasados', mult: Number(at.mult), ambos: true });
    return { pokemon: base.pokemon * extra.pokemon, treinador: base.treinador * extra.treinador, itens };
  }

  const STATS = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'];
  const BASE_DE = { hp: 'baseHp', atk: 'baseAtk', def: 'baseDef', spAtk: 'baseSpAtk', spDef: 'baseSpDef', speed: 'baseSpeed' };
  const tiposDe = (esp) => [esp.type1, esp.type2].filter(Boolean);
  const ivSpd = (iv) => Math.min(32, Math.max(1, Math.round(Number(iv) || 1)));
  const cdPeloIv = (ms, iv) => Math.max(REGRAS.pisoCdMs, ms - ivSpd(iv) * REGRAS.msPorIvSpd);

  function dano(nivel, power, atk, def, stab, efet) {
    const base = ((2 * nivel / 5 + 2) * power * Math.max(1, atk) / Math.max(1, def)) / 50 + 2;
    return base * (stab ? REGRAS.stab : 1) * efet * REGRAS.randMedio;
  }

  /** Stats do selvagem: IV médio, qualidade 1, potência I. */
  function statsSelvagem(esp, nivel, iv = REGRAS.ivSelvagemMedio) {
    const o = {};
    for (const k of STATS) o[k] = ((esp[BASE_DE[k]] ?? 0) + 2 * iv) * nivel / 100;
    return o;
  }

  /** Os golpes que o pokémon usa: liberados até o nível, com o desconto do Speed, mais o TM. */
  function golpesDoPokemon(pk, esp, mod) {
    const comSpeed = (cd) => mod.cooldown.cooldownGolpeComSpeed(cd, esp.baseSpeed, pk.ivs?.speed);
    const golpes = (esp.attacks ?? [])
      .filter((a) => (a.learnLevel ?? 1) <= (pk.level ?? 1))
      .map((a) => ({ ...a, cooldownMs: comSpeed(a.cooldownMs) }));
    if (pk.tmElemental && mod.tm?.golpeTmElemental) {
      const tm = mod.tm.golpeTmElemental(pk.tmElemental);
      golpes.push({ ...tm, cooldownMs: comSpeed(tm.cooldownMs) });
    }
    return golpes;
  }

  function criarEfetividade(ctx) {
    const tabela = ctx.consts.tabelaTipos ?? {};
    const fator = ctx.consts.ampliacaoHunt ?? 1.5;
    const cache = new Map();
    return (atq, d1, d2) => {
      const k = \`\${atq}|\${d1}|\${d2}\`;
      let v = cache.get(k);
      if (v === undefined) {
        v = ctx.mod.analyser.efetividadeHunt(atq, d1, d2 ?? null, tabela, fator);
        cache.set(k, v);
      }
      return v;
    };
  }

  /** A Investida sai no 1º tipo; só passa para o 2º se o alvo for imune ao 1º. */
  function tipoDaInvestida(tipos, ef, alvoTipos) {
    const [t1, t2] = tipos;
    if (t2 && ef(t1, alvoTipos[0], alvoTipos[1]) === 0) return t2;
    return t1;
  }

  /**
   * Segundos de luta por abate. A cada ataque o pokémon usa, entre os golpes prontos, o de
   * maior dano contra o alvo; sem golpe pronto vem a Investida; todo ataque ocupa o intervalo
   * global. O HP do selvagem rola por abate (IV 1–32) e as recargas correm no tempo morto.
   */
  function segundosPorAbate(golpes, investida, gapS, hps, mortoS) {
    const ordem = golpes.map((_, i) => i).filter((i) => golpes[i].d > 0).sort((a, b) => golpes[b].d - golpes[a].d);
    const pronto = golpes.map(() => 0);
    let proxInv = 0, t = 0, luta = 0;
    for (const hp of hps) {
      let feito = 0, ini = t, ultimo = t, ataques = 0;
      while (feito < hp) {
        if (++ataques > MEDIDO.maxAtaquesPorAbate) return Infinity;
        let i = -1;
        for (const j of ordem) if (pronto[j] <= t) { i = j; break; }
        if (i >= 0) {
          feito += golpes[i].d; pronto[i] = t + golpes[i].cdS; ultimo = t; t += gapS;
        } else if (investida.d > 0 && proxInv <= t) {
          feito += investida.d; proxInv = t + investida.cdS; ultimo = t; t += gapS;
        } else {
          let prox = investida.d > 0 ? proxInv : Infinity;
          for (const j of ordem) if (pronto[j] < prox) prox = pronto[j];
          if (!Number.isFinite(prox)) return Infinity;
          t = Math.max(t, prox);
        }
      }
      luta += ultimo - ini;
      t = ultimo + mortoS;
    }
    return luta / hps.length;
  }

  /** O que o selvagem faz com você: dano por segundo e o pior golpe (rolagem máxima). */
  function ameacaDoSelvagem(esp, nivel, pk, ef, ctx) {
    const st = statsSelvagem(esp, nivel);
    const tiposPk = pk.tipos;
    const tiposEsp = tiposDe(esp);
    const multDano = ctx.consts.multDanoSelvagem ?? 1.8;
    const golpes = (esp.attacks ?? []).filter((a) => (a.learnLevel ?? 1) <= nivel);
    const danos = golpes.map((a) => {
      const fisico = a.category !== 'SPECIAL';
      return dano(nivel, Math.max(REGRAS.poderMinimo, a.power), fisico ? st.atk : st.spAtk,
        fisico ? pk.stats.def : pk.stats.spDef, tiposEsp.includes(a.type), ef(a.type, tiposPk[0], tiposPk[1]));
    });
    const tipoInv = tipoDaInvestida(tiposEsp, ef, tiposPk);
    const inv = dano(nivel, REGRAS.investidaPower, st.atk, pk.stats.def, true, ef(tipoInv, tiposPk[0], tiposPk[1]));
    const media = danos.length ? (danos.reduce((s, x) => s + x, 0) / danos.length) * 0.92 + inv * 0.08 : inv;
    return {
      dps: media * multDano / REGRAS.gapSelvagemS,
      hitMedio: media * multDano,
      hitMax: Math.max(inv, ...danos) / REGRAS.randMedio * multDano,
    };
  }

  /** Acima do nível 150 o servidor repõe por slot, não por onda: é o teto físico da hunt. */
  function tetoDeReposicao(n, hunt) {
    if ((hunt.nivel ?? 0) <= MEDIDO.nivelOnda) return Infinity;
    const sinnoh = hunt.regiao === 'sinnoh' || String(hunt.slug).endsWith('_sinnoh');
    return n * 3600 / (sinnoh ? MEDIDO.slotSinnohS : MEDIDO.slotOutrasS);
  }

  /** Abates/h que a hunt entrega um a um: fila de chegada dos spawns, caminhada e reposição. */
  function abatesPorHora(dists, cicloS, hunt) {
    const d = dists.slice().sort((a, b) => a - b);
    const n = d.length;
    const dMed = d.reduce((s, x) => s + x, 0) / n;
    const caminho = dMed * MEDIDO.heroiSPorTile * MEDIDO.fBusca;
    const fEncontro = MEDIDO.selvagemSPorTile * MEDIDO.heroiSPorTile / (MEDIDO.selvagemSPorTile + MEDIDO.heroiSPorTile);
    let t = 0;
    for (const x of d) t = Math.max(t + cicloS + caminho, x * fEncontro);
    const porOnda = n * 3600 / (t + MEDIDO.gapOndaS);
    return Math.min(3600 / cicloS, porOnda, tetoDeReposicao(n, hunt));
  }

  /**
   * Com o TM AoE os abates saem em fluxo: cada golpe acerta \`alvos\` selvagens de uma vez e o
   * pokémon quase não anda — o selvagem só precisa ENTRAR no quadrado. O limite passa a ser a
   * chegada dos spawns (o penúltimo mais distante dita o ritmo: o último o herói vai buscar) e a
   * reposição do servidor.
   */
  function limiteAoe(dists, hunt) {
    const d = dists.slice().sort((a, b) => a - b);
    const dRitmo = d.length > 1 ? d[d.length - 2] : d[0];
    const raio = (REGRAS.ladoTmAoe - 1) / 2;
    const chegada = Math.max(0, dRitmo - raio) * MEDIDO.selvagemSPorTile;
    return Math.min(d.length * 3600 / (chegada + MEDIDO.gapOndaS), tetoDeReposicao(d.length, hunt));
  }
  const abatesPorHoraAoe = (dists, cicloS, hunt, alvos) => Math.min(3600 * alvos / cicloS, limiteAoe(dists, hunt));

  function simularHunt(h, pk, golpesPk, ef, ctx, opcoes) {
    const especiesHunt = (h.especies ?? [])
      .map((e) => ({ esp: ctx.especies.get(e.pokeId), pontos: Number(e.pontos) || 0 }))
      .filter((e) => e.esp && e.pontos > 0);
    const total = especiesHunt.reduce((s, e) => s + e.pontos, 0);
    if (!total) return null;
    const nivel = h.nivel ?? 1;

    // Quantos pontos de spawn: os pontos da própria hunt no jogo (no máximo 16 por onda). A
    // medição feita enquanto você caça só ajusta as DISTÂNCIAS — não o tamanho da hunt.
    const nSpawns = Math.max(1, Math.min(MEDIDO.maxSpawns, Math.round(total) || MEDIDO.spawnsPadrao));
    const medida = ctx.geo?.(h.slug) ?? null;
    const dists = medida?.dists?.length ? quantis(medida.dists, nSpawns) : Array(nSpawns).fill(MEDIDO.distPadrao);
    const mortoS = MEDIDO.msOndaS / dists.length + MEDIDO.retargetS;
    const gapS = cdPeloIv(REGRAS.gapJogadorMs, pk.ivs?.speed) / 1000;
    const cdInvS = cdPeloIv(REGRAS.investidaCdMs, pk.ivs?.speed) / 1000;

    let ttk = 0, dps = 0, hitMax = 0, hitMedio = 0, xpKill = 0, ouroKill = 0, lootKill = 0, efMedia = 0;
    let melhorGolpe = null, melhorDano = -1;
    const alvos = [];
    for (const { esp, pontos } of especiesHunt) {
      const w = pontos / total;
      const tiposAlvo = tiposDe(esp);
      const st = statsSelvagem(esp, nivel);
      const golpes = golpesPk.map((g) => {
        const fisico = g.category !== 'SPECIAL';
        const d = dano(pk.level, Math.max(REGRAS.poderMinimo, g.power), fisico ? pk.stats.atk : pk.stats.spAtk,
          fisico ? st.def : st.spDef, pk.tipos.includes(g.type), ef(g.type, tiposAlvo[0], tiposAlvo[1]));
        return { d, cdS: g.cooldownMs / 1000, g };
      });
      for (const g of golpes) {
        if (g.d * w > melhorDano) { melhorDano = g.d * w; melhorGolpe = g.g; }
      }
      const tipoInv = tipoDaInvestida(pk.tipos, ef, tiposAlvo);
      const investida = {
        d: dano(pk.level, REGRAS.investidaPower, pk.stats.atk, st.def, true, ef(tipoInv, tiposAlvo[0], tiposAlvo[1])),
        cdS: cdInvS,
      };
      const multHp = ctx.consts.multHpSelvagem ?? 5;
      const hps = [];
      for (let k = 0; k < MEDIDO.amostrasHp; k++) {
        const iv = 1 + Math.floor(k * 32 / MEDIDO.amostrasHp + 0.5);
        const hpStat = ((esp.baseHp ?? 0) + 2 * iv) * nivel / 100;
        hps.push(Math.max(REGRAS.hpCombateMin, Math.round(hpStat * REGRAS.hpCombateMult)) * multHp);
      }
      const s = segundosPorAbate(golpes, investida, gapS, hps, mortoS);
      if (!Number.isFinite(s)) { ttk = Infinity; break; }
      ttk += w * s;

      const ameaca = ameacaDoSelvagem(esp, nivel, pk, ef, ctx);
      dps += w * ameaca.dps;
      hitMedio += w * ameaca.hitMedio;
      hitMax = Math.max(hitMax, ameaca.hitMax);

      xpKill += w * ctx.mod.recompensa.xpPorDerrota(h, nivel, esp);
      ouroKill += w * ctx.mod.recompensa.ouroPorDerrotaHunt(h, nivel, esp);
      for (const l of esp.loot ?? []) {
        const preco = ctx.precoItem.get(l.name) ?? 0;
        if (!preco || !(l.chance > 0)) continue;
        lootKill += w * (l.chance / 100000) * (((l.minCount ?? 1) + (l.maxCount ?? 1)) / 2) * preco;
      }
      alvos.push({ w, tiposAlvo });
    }
    for (const { w, tiposAlvo } of alvos) {
      efMedia += w * (melhorGolpe ? ef(melhorGolpe.type, tiposAlvo[0], tiposAlvo[1]) : 1);
    }

    const base = {
      hunt: h, slug: h.slug, nome: h.nome, nivel, regiao: h.regiao ?? h.area ?? null,
      liberada: (ctx.eu?.level ?? Infinity) >= nivel,
      geoMedida: !!medida?.dists?.length,
      melhorGolpe: melhorGolpe ? { nome: melhorGolpe.name, tipo: melhorGolpe.type } : null,
      efetividade: efMedia,
    };
    if (!Number.isFinite(ttk)) return { ...base, inviavel: true, motivo: 'não mata', xpPokemonH: 0, xpTreinadorH: 0, ouroH: 0, kph: 0 };

    const cicloS = Math.max(ttk + MEDIDO.retargetS, MEDIDO.cicloMinS);
    let kph = abatesPorHora(dists, cicloS, h);
    let modoAoe = false;
    let engajados = 1;
    if (opcoes.aoe) {
      const kAoe = abatesPorHoraAoe(dists, cicloS, h, opcoes.alvosAoe);
      if (kAoe > kph) { kph = kAoe; modoAoe = true; }
      // O preço do AoE: você segura todos os que entraram no quadrado. Selvagens vivos ao mesmo
      // tempo ≈ ritmo de chegada × tempo de vida de cada um (lei de Little).
      engajados = Math.min(MEDIDO.aoeMaxEngajados, 1 + kph * ttk / 3600);
    }

    // Morte: com poção automática só morre quem leva, de uma vez, mais que o HP inteiro — com
    // AoE, o pior golpe de um somado ao golpe médio de cada outro selvagem engajado; sem poção,
    // morre quando o dano acumulado nos abates passa do HP.
    const hpPk = pk.maxHp ?? Math.max(REGRAS.hpCombateMin, Math.round(pk.stats.hp * REGRAS.hpCombateMult));
    const danoPorAbate = dps * engajados * ttk;
    const hitPior = hitMax + (engajados - 1) * hitMedio;
    const umHit = hitPior >= hpPk;
    const abatesPorVida = opcoes.comPocao
      ? (umHit ? hpPk / hitPior : 999)
      : hpPk / Math.max(1e-6, danoPorAbate);
    const dMed = dists.reduce((s, x) => s + x, 0) / dists.length;
    const tempoMorte = MEDIDO.respawnS + dMed * MEDIDO.heroiSPorTile;
    const vidaS = abatesPorVida * (kph > 0 ? 3600 / kph : 0);
    const uptime = vidaS / (vidaS + tempoMorte);
    const mortesH = abatesPorVida >= 999 ? 0 : 3600 / (vidaS + tempoMorte);
    const kphModelo = kph * uptime;
    // O ranking é sempre o modelo de onda cheia, nas mesmas condições para todas as hunts. O que
    // você mediu caçando aqui (10+ min com este pokémon) aparece só como referência — senão a
    // hunt em que você está ganharia ou perderia posição por isso.
    const kphMedido = ctx.ritmoMedido?.(h.slug) ?? null;
    const kphEf = kphModelo;

    const multPk = opcoes.bonusXp?.pokemon ?? 1;
    const multTr = opcoes.bonusXp?.treinador ?? 1;

    return {
      ...base,
      inviavel: false,
      ttk, kph: kphEf, kphModelo, kphMedido, mortesH, umHit,
      hitPct: hitPior / hpPk,
      danoPorAbate,
      aoe: modoAoe, engajados,
      _cicloS: cicloS, _limiteAoe: limiteAoe(dists, h),
      xpPokemonH: kphEf * xpKill * multPk,
      xpTreinadorH: kphEf * xpKill * multTr,
      ouroH: kphEf * (ouroKill + lootKill),
      ouroKill, lootKill, xpKill,
    };
  }

  /**
   * Recalibra os alvos por golpe do AoE com as hunts em que você já caçou 10+ min com este
   * pokémon: abates/h medido × ciclo de abate ÷ 3600. Hunts em que o ritmo bateu na chegada ou
   * na reposição ficam de fora — ali o número de alvos não aparece.
   */
  function calibrarAoe(pk, golpes, ef, ctx, op) {
    if (!ctx.ritmoMedido) return null;
    const obs = [];
    const semMedida = { ...ctx, ritmoMedido: null };
    for (const h of ctx.hunts ?? []) {
      const medido = ctx.ritmoMedido(h.slug);
      if (!medido) continue;
      const r = simularHunt(h, pk, golpes, ef, semMedida, { ...op, alvosAoe: MEDIDO.aoeAlvosPorGolpe });
      if (!r || r.inviavel || medido >= 0.9 * r._limiteAoe) continue;
      obs.push(medido * r._cicloS / 3600);
    }
    if (!obs.length) return null;
    return {
      alvos: Math.min(MEDIDO.aoeAlvosMax, Math.max(MEDIDO.aoeAlvosMin, mediana(obs))),
      hunts: obs.length,
    };
  }

  /**
   * Analisa todas as hunts para o pokémon \`pk\` (um item de \`estado.pokemons\`).
   * \`ctx\`: { mod, especies, precoItem, hunts, consts, eu, geo, ritmoMedido }.
   * \`opcoes\`: { comPocao = true, ordem = 'xp' | 'ouro', soLiberadas = true }.
   */
  function analisar(pk, ctx, opcoes = {}) {
    const op = { comPocao: true, ordem: 'xp', soLiberadas: true, ...opcoes };
    const esp = ctx.especies.get(pk.speciesId);
    if (!esp) throw new Error(\`espécie \${pk.speciesId} (\${pk.nome}) não está no catálogo\`);
    const stats = pk.stats ?? null;
    if (!stats) throw new Error('o jogo não mandou os stats deste pokémon');
    const poke = {
      ...pk,
      level: pk.level ?? 1,
      tipos: pk.tipos?.length ? pk.tipos : tiposDe(esp),
      stats,
    };
    const ef = criarEfetividade(ctx);
    const golpes = golpesDoPokemon(poke, esp, ctx.mod);
    const inicio = (typeof performance !== 'undefined' ? performance : Date).now();
    op.aoe = temAoe(poke);
    op.bonusXp = bonusXp(ctx.eu, ctx);
    const calibracao = op.aoe ? calibrarAoe(poke, golpes, ef, ctx, op) : null;
    op.alvosAoe = calibracao?.alvos ?? MEDIDO.aoeAlvosPorGolpe;
    const linhas = [];
    for (const h of ctx.hunts ?? []) {
      const r = simularHunt(h, poke, golpes, ef, ctx, op);
      if (r) linhas.push(r);
    }
    const chave = op.ordem === 'ouro' ? 'ouroH' : 'xpPokemonH';
    linhas.sort((a, b) => (b[chave] - a[chave]) || (a.nivel - b.nivel));
    return {
      pokemon: poke,
      especie: esp,
      golpes,
      aoe: op.aoe ? { alvosPorGolpe: op.alvosAoe, calibradoEm: calibracao?.hunts ?? 0 } : null,
      bonusXp: op.bonusXp,
      linhas: op.soLiberadas ? linhas.filter((l) => l.liberada) : linhas,
      total: linhas.length,
      ms: Math.round((typeof performance !== 'undefined' ? performance : Date).now() - inicio),
    };
  }

  PIH.engine = { analisar, REGRAS, MEDIDO, _interno: { dano, statsSelvagem, segundosPorAbate, abatesPorHora, abatesPorHoraAoe, golpesDoPokemon, temAoe, bonusXp, quantis } };
})(globalThis);

;
// Geometria das hunts e ritmo real, medidos enquanto você joga.
//
// GEOMETRIA (entra no cálculo): o mapa público do jogo não diz onde os selvagens nascem. Aqui,
// no instante em que uma ONDA CHEIA nasce, guardamos a distância (em tiles) do seu pokémon até
// cada selvagem novo — é a "fila de chegada" que o motor usa para estimar abates/h. Só onda
// cheia conta (pelo menos 80% dos pontos de spawn da hunt nascendo juntos): entrada no meio de
// uma onda ou reposição avulsa não dizem como a hunt é. Hunt sem onda cheia medida (e as de
// reposição por slot, acima do nv 150, que nunca têm onda) usa a geometria padrão, igual para
// todas — o ranking compara as hunts nas mesmas condições.
//
// RITMO (só referência): os abates/h de verdade por hunt e por pokémon. NÃO muda o ranking —
// senão a hunt em que você está caçando ganharia ou perderia posição só por isso.
//
// Tudo fica no localStorage do pokeidle.io, numa chave só da extensão.
(function (root) {
  'use strict';
  const PIH = (root.__pokeidleHunt ??= {});
  // v3: só ondas cheias. As amostras das versões anteriores (tiradas na entrada da hunt) são
  // descartadas; o ritmo medido (abates/h) é trazido.
  const CHAVE = 'pokeidle-hunt:geo:v3';
  const ANTIGAS = ['pokeidle-hunt:geo:v2', 'pokeidle-hunt:geo:v1'];
  const MAX_AMOSTRAS = 6;
  const JANELA_ONDA_MS = 4000; // selvagens que nascem dentro disto são a mesma onda
  const FRACAO_CHEIA = 0.8;
  const MIN_ONDA = 6;
  const MAX_SPAWNS = 16;

  let banco = ler();
  function ler() {
    try {
      const atual = JSON.parse(localStorage.getItem(CHAVE));
      if (atual) return atual;
      const hunts = {};
      for (const chave of ANTIGAS) {
        const velho = JSON.parse(localStorage.getItem(chave));
        for (const [slug, h] of Object.entries(velho?.hunts ?? {})) if (h.ritmo && !hunts[slug]) hunts[slug] = { ritmo: h.ritmo };
      }
      return { hunts };
    } catch { return { hunts: {} }; }
  }
  let gravarTimer = null;
  function gravar() {
    clearTimeout(gravarTimer);
    gravarTimer = setTimeout(() => {
      try { localStorage.setItem(CHAVE, JSON.stringify(banco)); } catch { /* cota cheia: segue sem */ }
    }, 2000);
  }

  // Quantos pontos de spawn cada hunt tem — a composição que o jogo manda no welcome.
  const pontosDaHunt = new Map();
  PIH.on?.('welcome', (m) => {
    for (const h of m?.hunts ?? []) {
      const total = (h.especies ?? []).reduce((s, e) => s + (Number(e.pontos) || 0), 0);
      if (h.slug && total) pontosDaHunt.set(h.slug, Math.min(MAX_SPAWNS, Math.round(total)));
    }
  });
  const ondaCheia = (slug) => Math.max(MIN_ONDA, Math.ceil(FRACAO_CHEIA * (pontosDaHunt.get(slug) ?? 15)));

  // O pacote vem com chaves curtas (ver \`mesclar\` em campo.mjs do jogo): \`s\` slot, \`c\`/\`r\`
  // posição, \`x\` morto. Boneco de XP Share, pet em treino, NPCs e treinadores não são selvagens.
  const naoSelvagem = (m) => m.bn || m.ti !== undefined || m.cura || m.tm || m.depot || m.tr;

  /** A distribuição das distâncias (todas as ondas cheias medidas). Quantos spawns, vem do jogo. */
  function distsDe(h) {
    const todas = (h?.amostras ?? []).flat();
    return todas.length ? todas.sort((a, b) => a - b) : null;
  }

  // ---- sessão atual -----------------------------------------------------------------------
  // { slug, pkId, inicio, abates, slots: Map(slot → vivo?), heroi: {c, r}, onda: { dists, timer } }
  let sessao = null;

  function fecharSessao() {
    if (!sessao) return;
    clearTimeout(sessao.onda?.timer);
    const seg = (Date.now() - sessao.inicio) / 1000;
    if (seg >= 60 && sessao.abates > 0) {
      const h = (banco.hunts[sessao.slug] ??= {});
      const r = ((h.ritmo ??= {})[sessao.pkId ?? '?'] ??= { abates: 0, seg: 0 });
      r.abates += sessao.abates;
      r.seg += seg;
      gravar();
    }
    sessao = null;
  }

  function fecharOnda(s) {
    const onda = s.onda;
    s.onda = null;
    if (!onda || onda.dists.length < ondaCheia(s.slug)) return; // onda parcial: não conta
    const h = (banco.hunts[s.slug] ??= {});
    h.amostras = [...(h.amostras ?? []), onda.dists.sort((a, b) => a - b)].slice(-MAX_AMOSTRAS);
    h.medidoEm = Date.now();
    gravar();
  }

  /** Um selvagem nasceu: entra na onda que está nascendo (ou começa uma). */
  function nasceu(s, x) {
    if (!s.heroi || x.c == null || x.r == null) return;
    if (!s.onda) {
      const onda = { dists: [] };
      onda.timer = setTimeout(() => { if (s.onda === onda) fecharOnda(s); }, JANELA_ONDA_MS);
      s.onda = onda;
    }
    s.onda.dists.push(Math.round(Math.hypot(x.c - s.heroi.c, x.r - s.heroi.r) * 10) / 10);
  }

  // O ritmo é guardado por pokémon e por "com/sem disco AoE": aplicar o disco muda o ritmo, e
  // a medição de antes não pode contaminar a de depois.
  const chaveDoPokemon = (pk) => {
    if (!pk?.id) return null;
    const aoe = pk.tmAoe ?? pk.tm_aoe;
    return \`\${pk.id}\${aoe === true || aoe === 'true' || aoe === 1 ? ':aoe' : ''}\`;
  };
  let pkAtivoId = null;
  PIH.on?.('estado', (eu) => {
    const chave = chaveDoPokemon(eu?.pokemons?.find((p) => p.id === eu.activeId));
    if (chave !== pkAtivoId) {
      fecharSessao();
      pkAtivoId = chave;
    }
  });

  PIH.on?.('campo.init', (m) => {
    fecharSessao();
    if (!m?.slug || m.centro || m.pvp || m.casa != null) return;
    // A entrada NÃO é medida: o herói está na porta do mapa e a onda pode estar pela metade.
    sessao = { slug: m.slug, pkId: pkAtivoId, inicio: Date.now(), abates: 0, slots: new Map(), heroi: null, onda: null };
    if (m.heroi?.c != null) sessao.heroi = { c: m.heroi.c, r: m.heroi.r };
    for (const x of m.mobs ?? []) if (!naoSelvagem(x)) sessao.slots.set(x.s, !x.x);
  });

  PIH.on?.('campo', (m) => {
    const s = sessao;
    if (!s) return;
    if (m.heroi?.c != null) s.heroi = { c: m.heroi.c, r: m.heroi.r };
    for (const x of m.mobs ?? []) {
      if (naoSelvagem(x)) continue;
      const conhecido = s.slots.has(x.s);
      const vivoAntes = s.slots.get(x.s);
      if (x.x) {
        if (vivoAntes) s.abates++;
        s.slots.set(x.s, false);
      } else if (!conhecido || (vivoAntes === false && x.x === false)) {
        // slot novo, ou um corpo que voltou à vida: é um selvagem nascendo
        s.slots.set(x.s, true);
        nasceu(s, x);
      }
    }
    for (const slot of m.fora ?? []) s.slots.delete(slot);
  });

  addEventListener('pagehide', fecharSessao);

  PIH.geo = {
    /** \`{ dists }\` da hunt (ondas cheias medidas), ou null. */
    daHunt(slug) {
      const dists = distsDe(banco.hunts[slug]);
      return dists ? { dists } : null;
    },
    chaveDoPokemon,
    /** Abates/h medidos com este pokémon nesta hunt (só com 10+ min acumulados). Só referência. */
    ritmoMedido(slug, chave) {
      const r = banco.hunts[slug]?.ritmo?.[chave];
      return r && r.seg >= 600 ? r.abates * 3600 / r.seg : null;
    },
    huntsMedidas: () => Object.values(banco.hunts).filter((h) => h.amostras?.length).length,
  };
})(globalThis);

;
// A tela: o botão /hunt ao lado do nome do pokémon em campo e o painel "Onde caçar?".
//
// O card "Em campo" do jogo (\`#ativo-card\`) é redesenhado inteiro a cada atualização do
// estado. Por isso a barra /hunt NÃO mora dentro dele: fica no painel em volta (\`#p-ativo\`),
// que não é redesenhado, logo antes do card — no fluxo, acima do pokémon, na largura da caixa.
//
// Ao abrir o jogo, a extensão confere onde está o pokémon ativo. Se o card não estiver onde
// esperamos (layout novo do jogo), ela pede um clique nele e lembra a escolha.
(function (root) {
  'use strict';
  const PIH = (root.__pokeidleHunt ??= {});
  if (!PIH.on || !PIH.engine) return;

  const CHAVE_PREFS = 'pokeidle-hunt:prefs:v1';
  const CHAVE_ALVO = 'pokeidle-hunt:alvo:v1';
  const POR_PAGINA = 25;

  const lerJson = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
  const gravarJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

  let prefs = { ordem: 'xp', soLiberadas: true, comPocao: true, ...lerJson(CHAVE_PREFS, {}) };
  let welcome = null;
  let eu = null;

  // ---- formatação ------------------------------------------------------------------------
  const nf = new Intl.NumberFormat('pt-BR');
  const nfc = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  const num = (v) => nf.format(Math.round(v));
  const curto = (v) => (Math.abs(v) >= 10000 ? nfc.format(v) : num(v));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const REGIAO = { kanto: 'Kanto', johto: 'Johto', outland: 'Outland', orre: 'Orre', hoenn: 'Hoenn', sinnoh: 'Sinnoh', unova: 'Unova', kalos: 'Kalos', alola: 'Alola', galar: 'Galar', paldea: 'Paldea' };
  const regiao = (r) => REGIAO[r] ?? (r ? r[0].toUpperCase() + r.slice(1) : '');
  const segundos = (s) => (s < 1 ? '<1 s' : s < 60 ? \`\${s.toFixed(1).replace('.', ',')} s\` : \`\${Math.floor(s / 60)} min \${Math.round(s % 60)} s\`);

  const pkAtivo = () => eu?.pokemons?.find((p) => p.id === eu.activeId) ?? null;

  // ---- o botão ---------------------------------------------------------------------------
  function criarBotao(extra = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = \`pih-btn \${extra}\`.trim();
    b.textContent = '/hunt';
    return b;
  }

  const botao = criarBotao('pih-barra');
  botao.title = 'Onde caçar? — as melhores hunts para o seu pokémon em campo';
  botao.setAttribute('aria-label', botao.title);
  botao.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    alternarPainel();
  });

  let alvoManual = lerJson(CHAVE_ALVO, null); // seletor escolhido pelo jogador, se o padrão falhar

  function ancora() {
    if (alvoManual) {
      const el = document.querySelector(alvoManual);
      if (el) return { modo: 'manual', el };
    }
    const card = document.getElementById('ativo-card');
    const painel = document.getElementById('p-ativo');
    const nome = card?.querySelector('.ativo-nome');
    if (card && painel && nome && !card.classList.contains('vazio')) return { modo: 'padrao', card, nome };
    return null;
  }

  let quadro = 0;
  function posicionarBotao() {
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(() => {
      const a = ancora();
      if (!a) { botao.hidden = true; return; }
      botao.hidden = false;
      if (a.modo === 'padrao') {
        botao.classList.remove('pih-fixo');
        botao.classList.add('pih-barra');
        botao.style.left = botao.style.top = botao.style.width = '';
        if (a.card.previousElementSibling !== botao) a.card.before(botao);
      } else {
        // Reserva: flutua logo acima do ponto que o jogador apontou.
        botao.classList.remove('pih-barra');
        botao.classList.add('pih-fixo');
        if (botao.parentElement !== document.body) document.body.appendChild(botao);
        const r = a.el.getBoundingClientRect();
        botao.style.left = \`\${r.left}px\`;
        botao.style.top = \`\${Math.max(4, r.top - botao.offsetHeight - 6)}px\`;
      }
    });
  }

  function vigiarCard() {
    const painel = document.getElementById('p-ativo') ?? document.body;
    new MutationObserver(posicionarBotao).observe(painel, { childList: true, subtree: true });
    addEventListener('resize', posicionarBotao);
    addEventListener('scroll', posicionarBotao, true);
    // Rede de segurança para mudanças de layout que não mexem no card (abrir/fechar painéis).
    setInterval(posicionarBotao, 1500);
  }

  // ---- verificação: onde está o pokémon ativo? -------------------------------------------
  let aviso = null;
  function mostrarAviso(html, { fechaEm = 0, acao = null } = {}) {
    aviso?.remove();
    aviso = document.createElement('div');
    aviso.className = 'pih-aviso';
    aviso.append(criarBotao());
    const txt = document.createElement('div');
    txt.innerHTML = html;
    aviso.append(txt);
    if (acao) aviso.append(acao);
    const x = document.createElement('button');
    x.className = 'pih-x';
    x.textContent = '×';
    x.onclick = () => { aviso?.remove(); aviso = null; pararMira(); };
    aviso.append(x);
    document.body.append(aviso);
    if (fechaEm) setTimeout(() => { if (aviso?.contains(txt)) { aviso.remove(); aviso = null; } }, fechaEm);
  }

  let verificado = false;
  function verificar(tentativa = 0) {
    if (verificado || !eu) return;
    const pk = pkAtivo();
    if (!pk) {
      if (tentativa === 0) mostrarAviso('Coloque um pokémon <b>em campo</b> para usar o <b>/hunt</b>.', { fechaEm: 8000 });
      setTimeout(() => verificar(1), 3000);
      return;
    }
    const a = ancora();
    const texto = a?.modo === 'padrao' ? a.nome.textContent : a?.el?.textContent;
    if (a && texto?.includes(pk.nome)) {
      verificado = true;
      posicionarBotao();
      mostrarAviso(\`Pokémon em campo encontrado: <b>\${esc(pk.nome)}</b>. O <b>/hunt</b> está logo acima dele.\`, { fechaEm: 4500 });
      return;
    }
    if (tentativa < 12) { setTimeout(() => verificar(tentativa + 1), 500); return; }
    const mirar = document.createElement('button');
    mirar.className = 'pih-mais';
    mirar.style.width = 'auto';
    mirar.textContent = 'Apontar';
    mirar.onclick = iniciarMira;
    mostrarAviso(\`<b>Onde está seu Pokémon ativo?</b><br>Não achei o card de <b>\${esc(pk.nome)}</b>. Clique em “Apontar” e depois no nome dele.\`, { acao: mirar });
  }

  let mirando = null;
  function iniciarMira() {
    document.documentElement.classList.add('pih-mirando');
    let marcado = null;
    const sobre = (ev) => {
      marcado?.classList.remove('pih-alvo');
      marcado = ev.target instanceof Element && !ev.target.closest('.pih-aviso') ? ev.target : null;
      marcado?.classList.add('pih-alvo');
    };
    const clique = (ev) => {
      if (!marcado) return;
      ev.preventDefault();
      ev.stopPropagation();
      alvoManual = seletorDe(marcado);
      gravarJson(CHAVE_ALVO, alvoManual);
      pararMira();
      verificado = true;
      posicionarBotao();
      mostrarAviso('Pronto: o <b>/hunt</b> vai ficar logo acima deste ponto.', { fechaEm: 4000 });
    };
    addEventListener('mouseover', sobre, true);
    addEventListener('click', clique, true);
    mirando = () => {
      removeEventListener('mouseover', sobre, true);
      removeEventListener('click', clique, true);
      marcado?.classList.remove('pih-alvo');
    };
  }
  function pararMira() {
    document.documentElement.classList.remove('pih-mirando');
    mirando?.();
    mirando = null;
  }
  function seletorDe(el) {
    const partes = [];
    while (el && el !== document.body) {
      if (el.id) { partes.unshift(\`#\${CSS.escape(el.id)}\`); break; }
      const i = [...el.parentElement.children].indexOf(el) + 1;
      partes.unshift(\`\${el.tagName.toLowerCase()}:nth-child(\${i})\`);
      el = el.parentElement;
    }
    return partes.join(' > ');
  }

  // ---- o painel --------------------------------------------------------------------------
  let painel = null;
  let mostrando = POR_PAGINA;
  let assinatura = '';

  function alternarPainel() {
    if (painel) return fecharPainel();
    painel = document.createElement('div');
    painel.className = 'pih-painel';
    painel.setAttribute('role', 'dialog');
    painel.setAttribute('aria-label', 'Onde caçar?');
    document.body.append(painel);
    mostrando = POR_PAGINA;
    posicionarPainel();
    desenhar();
    addEventListener('keydown', aoTeclar, true);
    setTimeout(() => addEventListener('pointerdown', aoClicarFora, true));
  }
  function fecharPainel() {
    painel?.remove();
    painel = null;
    assinatura = '';
    removeEventListener('keydown', aoTeclar, true);
    removeEventListener('pointerdown', aoClicarFora, true);
  }
  const aoTeclar = (ev) => { if (ev.key === 'Escape') fecharPainel(); };
  const aoClicarFora = (ev) => { if (painel && !painel.contains(ev.target) && ev.target !== botao) fecharPainel(); };

  function posicionarPainel() {
    if (!painel) return;
    const base = document.getElementById('p-ativo')?.getBoundingClientRect() ?? botao.getBoundingClientRect();
    const larg = painel.offsetWidth || 640;
    let left = base.right + 10;
    if (left + larg > innerWidth - 8) left = Math.max(8, innerWidth - larg - 8);
    const top = Math.min(Math.max(8, base.top - 60), Math.max(8, innerHeight - painel.offsetHeight - 8));
    painel.style.left = \`\${left}px\`;
    painel.style.top = \`\${top}px\`;
  }

  function cabecalho(pk) {
    const q = Number(pk?.quality ?? pk?.qualidade);
    const iv = pk?.ivs ? Object.values(pk.ivs).reduce((s, x) => s + (Number(x) || 0), 0) : null;
    const sub = pk
      ? [esc(pk.nome), \`Nv \${num(pk.level)}\`, \`P\${pk.potencia ?? 1}\`, Number.isFinite(q) ? \`Q \${q.toFixed(3).replace('.', ',')}\` : '', iv != null ? \`IV \${iv}\` : '',
        PIH.engine._interno.temAoe(pk) ? 'TM AoE' : '']
        .filter(Boolean).join(' · ')
      : 'nenhum pokémon em campo';
    return \`<div class="pih-cab">
      <span class="pih-btn" aria-hidden="true">/hunt</span>
      <div class="pih-titulo"><h3>Onde caçar? <span class="pih-credito">made by Liang</span></h3><small>\${sub}</small></div>
      <button type="button" class="pih-fechar" data-acao="fechar" title="Fechar (Esc)">×</button>
    </div>\`;
  }

  function blocoStats(pk) {
    if (!pk?.stats) return '';
    const rot = [['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['spAtk', 'SP.ATK'], ['spDef', 'SP.DEF'], ['speed', 'SPD']];
    return \`<div class="pih-vao pih-stats">\${rot.map(([k, r]) => \`
      <div class="pih-stat"><b>\${r}</b><span>\${num(pk.stats[k] ?? 0)}</span>\${pk.ivs?.[k] != null ? \`<i>IV \${pk.ivs[k]}</i>\` : ''}</div>\`).join('')}
    </div>\`;
  }

  /** Os bônus de XP que entraram na conta (multiplicam-se, como no jogo). */
  function blocoBonus(b) {
    if (!b) return '';
    const x = (v) => \`×\${v.toFixed(2).replace('.', ',')}\`;
    const fmt = (i) => \`\${esc(i.nome)} \${i.mult >= 2 ? x(i.mult) : \`+\${(Math.round((i.mult - 1) * 1000) / 10).toString().replace('.', ',')}%\`}\`;
    const lista = b.itens.length ? b.itens.map(fmt).join(' · ') : 'nenhum bônus ativo';
    const iguais = Math.abs(b.pokemon - b.treinador) < 1e-6;
    return \`<div class="pih-vao pih-bonus" title="Os bônus se multiplicam entre si (Pokepédia → Níveis e XP)">
      <b>Bônus de XP:</b> \${lista}
      <span class="pih-bonus-total">\${iguais ? x(b.pokemon) : \`pokémon \${x(b.pokemon)} · treinador \${x(b.treinador)}\`}</span>
    </div>\`;
  }

  function controles() {
    return \`<div class="pih-ctrl">
      <span class="pih-seg">
        <button type="button" data-ordem="xp" class="\${prefs.ordem === 'xp' ? 'on' : ''}">XP/h</button>
        <button type="button" data-ordem="ouro" class="\${prefs.ordem === 'ouro' ? 'on' : ''}">Ouro/h</button>
      </span>
      <label><input type="checkbox" data-pref="soLiberadas" \${prefs.soLiberadas ? 'checked' : ''}> só hunts liberadas</label>
      <label title="Com a automação de poção ligada, só morre quem leva um golpe maior que o HP inteiro"><input type="checkbox" data-pref="comPocao" \${prefs.comPocao ? 'checked' : ''}> poção automática</label>
      \${prefs.ordem === 'ouro' ? '<button type="button" class="pih-ajuda" data-acao="ajuda-ouro" aria-expanded="false" aria-controls="pih-dica-ouro" title="O que entra no ouro/h">?</button>' : ''}
    </div>
    \${prefs.ordem === 'ouro' ? \`<div class="pih-vao pih-dica" id="pih-dica-ouro" hidden>
      O ouro/h soma o <b>ouro de cada abate</b> e o <b>loot</b> vendido ao NPC.
      A <b>venda dos pokémon capturados</b> não entra no cálculo.
    </div>\` : ''}\`;
  }

  function risco(l) {
    if (l.umHit) return '<span class="pih-perigo" title="Um golpe do selvagem passa do seu HP">☠ 1 hit</span>';
    if (l.mortesH >= 0.5) return \`<span class="pih-perigo" title="Mortes estimadas por hora">☠ \${l.mortesH.toFixed(1).replace('.', ',')}/h</span>\`;
    const pct = Math.round(l.hitPct * 100);
    const oque = l.engajados > 1.2
      ? \`O pior momento (o golpe mais forte de um selvagem mais o golpe médio dos outros \${(l.engajados - 1).toFixed(1).replace('.', ',')} que o AoE segura em você) tira \${pct}% do seu HP\`
      : \`O pior golpe do selvagem tira \${pct}% do seu HP\`;
    if (pct >= 50) return \`<span class="pih-alerta" title="\${oque}">⚠ \${pct}%</span>\`;
    return \`<span class="pih-ok" title="\${oque}">✓ \${pct}%</span>\`;
  }

  function linhaHtml(l, i) {
    const medido = l.kphMedido != null ? \` · você fez \${num(l.kphMedido)} abates/h aqui com este pokémon (referência; não muda o ranking)\` : '';
    const aprox = l.aoe
      ? \`<span class="pih-aprox" title="Estimativa com o TM AoE: \${l.engajados.toFixed(1).replace('.', ',')} selvagens em você ao mesmo tempo\${l.geoMedida ? '' : '; geometria padrão'}\${medido}">≈AoE</span>\`
      : l.geoMedida
        ? (medido ? \`<span class="pih-medido" title="Geometria medida em ondas cheias\${medido}">●</span>\` : '')
        : \`<span class="pih-aprox" title="Geometria padrão (sem onda cheia medida nesta hunt)\${medido}">≈</span>\`;
    const cls = [i === 0 && !l.inviavel ? 'pih-top' : '', l.liberada ? '' : 'pih-bloq'].filter(Boolean).join(' ');
    const golpe = l.melhorGolpe ? \`\${esc(l.melhorGolpe.nome)} ×\${l.efetividade.toFixed(2).replace('.', ',')}\` : '';
    if (l.inviavel) {
      return \`<tr class="\${cls}"><td class="pih-pos">\${i + 1}</td>
        <td class="pih-hunt"><b>\${esc(l.nome)}</b><small>\${regiao(l.regiao)} · Nv \${num(l.nivel)}</small></td>
        <td colspan="5"><span class="pih-perigo">não mata o selvagem</span></td></tr>\`;
    }
    return \`<tr class="\${cls}" title="\${esc(golpe)}">
      <td class="pih-pos">\${i + 1}</td>
      <td class="pih-hunt"><b>\${esc(l.nome)}</b><small>\${regiao(l.regiao)} · Nv \${num(l.nivel)}\${l.liberada ? '' : ' · 🔒'}</small></td>
      <td>\${curto(prefs.ordem === 'ouro' ? l.ouroH : l.xpPokemonH)}</td>
      <td>\${aprox}\${num(l.kph)}</td>
      <td>\${segundos(l.ttk)}</td>
      <td>\${risco(l)}</td>
      <td>\${curto(prefs.ordem === 'ouro' ? l.xpPokemonH : l.ouroH)}</td>
    </tr>\`;
  }

  function corpo(r, jogo) {
    const linhas = r.linhas;
    if (!linhas.length) return '<div class="pih-erro">Nenhuma hunt liberada para o seu nível de treinador.</div>';
    const top = linhas.find((l) => !l.inviavel);
    const outro = prefs.ordem === 'ouro' ? 'XP/h' : 'Ouro/h';
    const melhor = top ? \`<div class="pih-vao pih-melhor">
        <span class="pih-coroa">👑</span>
        <div><strong>\${esc(top.nome)}</strong> <span class="pih-dim">\${regiao(top.regiao)} · Nv \${num(top.nivel)}</span><br>
        \${curto(top.xpPokemonH)} XP/h do pokémon · \${curto(top.xpTreinadorH)} XP/h do treinador · \${curto(top.ouroH)} ouro/h · \${num(top.kph)} abates/h\${top.melhorGolpe ? \` · \${esc(top.melhorGolpe.nome)}\` : ''}</div>
      </div>\` : '';
    return \`\${melhor}
      <div class="pih-vao pih-lista"><table class="pih-tab">
        <thead><tr><th>#</th><th>Hunt</th><th>\${prefs.ordem === 'ouro' ? 'Ouro/h' : 'XP/h'}</th><th>Abates/h</th><th>Mata em</th><th>Risco</th><th>\${outro}</th></tr></thead>
        <tbody>\${linhas.slice(0, mostrando).map(linhaHtml).join('')}</tbody>
      </table>
      \${linhas.length > mostrando ? \`<button type="button" class="pih-mais" data-acao="mais">mostrar mais (\${linhas.length - mostrando})</button>\` : ''}
      </div>
      <div class="pih-rodape">Dados do jogo \${jogo.versao ? \`v\${esc(jogo.versao)}\` : 'no ar'} · \${r.linhas.length} de \${r.total} hunts · cálculo em \${r.ms} ms · ranking com ondas cheias · geometria medida em \${PIH.geo?.huntsMedidas?.() ?? 0} hunts (≈ = padrão · ● = você já caçou aqui, passe o mouse)\${r.aoe ? \` · TM AoE: \${r.aoe.alvosPorGolpe.toFixed(1).replace('.', ',')} alvos/golpe (\${r.aoe.calibradoEm ? \`calibrado em \${r.aoe.calibradoEm} hunt\${r.aoe.calibradoEm > 1 ? 's' : ''} suas\` : 'padrão, até você caçar 10+ min com ele'})\` : ''}</div>\`;
  }

  async function desenhar() {
    if (!painel) return;
    const pk = pkAtivo();
    if (!welcome || !eu) {
      painel.innerHTML = \`\${cabecalho(pk)}<div class="pih-carga">Esperando o jogo conectar…</div>\`;
      ligarEventos();
      return;
    }
    if (!pk) {
      painel.innerHTML = \`\${cabecalho(null)}<div class="pih-erro">Coloque um pokémon em campo para ver onde caçar.</div>\`;
      ligarEventos();
      return;
    }
    painel.innerHTML = \`\${cabecalho(pk)}\${blocoStats(pk)}\${controles()}<div class="pih-carga">Lendo o jogo…</div>\`;
    ligarEventos();
    posicionarPainel();
    try {
      const jogo = await PIH.carregarJogo();
      if (!painel) return;
      const r = PIH.engine.analisar(pk, contexto(jogo, pk), prefs);
      painel.innerHTML = \`\${cabecalho(r.pokemon)}\${blocoStats(r.pokemon)}\${blocoBonus(r.bonusXp)}\${controles()}\${corpo(r, jogo)}\`;
      assinatura = assinaturaDe(pk);
    } catch (err) {
      console.error('[pokeidle-hunt]', err);
      if (!painel) return;
      painel.innerHTML = \`\${cabecalho(pk)}<div class="pih-erro">Não consegui calcular: \${esc(err.message)}</div>\`;
    }
    ligarEventos();
    posicionarPainel();
  }

  function contexto(jogo, pk) {
    const chave = PIH.geo?.chaveDoPokemon(pk);
    const precoItem = new Map(jogo.precoItem);
    for (const i of welcome.itensNossos ?? []) {
      if (i?.name && Number(i.npcPrice) > 0) precoItem.set(i.name, Number(i.npcPrice));
    }
    return {
      mod: jogo.mod,
      especies: jogo.especies,
      precoItem,
      hunts: welcome.hunts ?? [],
      consts: {
        tabelaTipos: welcome.tabelaTipos,
        ampliacaoHunt: welcome.ampliacaoHunt,
        multHpSelvagem: welcome.multHpSelvagem,
        multDanoSelvagem: welcome.multDanoSelvagem,
        tiposBoost: welcome.tiposBoost,
      },
      eu,
      geo: (slug) => PIH.geo?.daHunt(slug) ?? null,
      ritmoMedido: (slug) => (chave ? PIH.geo?.ritmoMedido(slug, chave) ?? null : null),
    };
  }

  function ligarEventos() {
    if (!painel) return;
    painel.querySelector('[data-acao="fechar"]')?.addEventListener('click', fecharPainel);
    painel.querySelector('[data-acao="mais"]')?.addEventListener('click', () => { mostrando += POR_PAGINA; desenhar(); });
    const ajuda = painel.querySelector('[data-acao="ajuda-ouro"]');
    ajuda?.addEventListener('click', () => {
      const dica = painel.querySelector('#pih-dica-ouro');
      dica.hidden = !dica.hidden;
      ajuda.setAttribute('aria-expanded', String(!dica.hidden));
    });
    for (const b of painel.querySelectorAll('[data-ordem]')) {
      b.addEventListener('click', () => { prefs.ordem = b.dataset.ordem; gravarJson(CHAVE_PREFS, prefs); desenhar(); });
    }
    for (const c of painel.querySelectorAll('[data-pref]')) {
      c.addEventListener('change', () => { prefs[c.dataset.pref] = c.checked; gravarJson(CHAVE_PREFS, prefs); desenhar(); });
    }
  }

  // Recalcula com o painel aberto só quando muda o que entra na conta (outro pokémon, nível
  // novo, refino, TM) — não a cada golpe recebido.
  const assinaturaDe = (pk) => (pk ? \`\${pk.id}|\${pk.level}|\${pk.tmElemental ?? ''}|\${pk.tmAoe ?? ''}|\${JSON.stringify(pk.stats)}\` : '');

  // ---- ligação com o jogo ----------------------------------------------------------------
  function preaquecer() {
    const ocioso = root.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
    ocioso(() => PIH.carregarJogo().catch((err) => console.warn('[pokeidle-hunt] pré-carga falhou', err)));
  }

  PIH.on('welcome', (m) => {
    welcome = m;
    preaquecer();
  });
  PIH.on('estado', (e) => {
    const primeiro = !eu;
    eu = e;
    posicionarBotao();
    if (primeiro) setTimeout(() => verificar(0), 800);
    if (painel && assinatura && assinaturaDe(pkAtivo()) !== assinatura) desenhar();
  });

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', vigiarCard, { once: true });
  else vigiarCard();
})(globalThis);

  })()`;

  try {
    if (typeof process !== 'undefined' && process.versions?.electron && typeof require === 'function') {
      const { webFrame } = require('electron');
      if (webFrame && typeof webFrame.executeJavaScript === 'function') {
        webFrame.executeJavaScript(runner).catch(err => {
          console.error('[PokeFarm] Erro ao injetar /hunt:', err);
        });
        return;
      }
    }
  } catch (_) {}

  try {
    const fn = new Function(runner);
    fn();
  } catch (err) {
    console.error('[PokeFarm] Fallback /hunt:', err);
  }
}

if (typeof window !== 'undefined' && /(^|\.)pokeidle\.io$/.test(window.location.hostname)) {
  installPokeidleHunt();
}

if (typeof module !== 'undefined') {
  module.exports = { installPokeidleHunt };
}
