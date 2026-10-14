'use strict';
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'assets', 'addons', 'pokeidle-hunt');
const css = fs.readFileSync(path.join(dir, 'ui.css'), 'utf8');

const hook = fs.readFileSync(path.join(dir, 'hook.js'), 'utf8');
const game = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
const engine = fs.readFileSync(path.join(dir, 'engine.js'), 'utf8');
const geo = fs.readFileSync(path.join(dir, 'geo.js'), 'utf8');
const ui = fs.readFileSync(path.join(dir, 'ui.js'), 'utf8');

const scriptsCombined = [hook, game, engine, geo, ui].join('\n;\n');

const cssLiteral = JSON.stringify(css);

const code = `'use strict';
// PokeFarm — Injetor autocontido do addon /hunt for PokeIdle
// Totalmente embutido, sem dependência de require('fs') ou require('path') em runtime.

const HUNT_CSS = ${cssLiteral};

function installPokeidleHunt() {
  if (typeof window === 'undefined' || !/(^|\\.)pokeidle\\.io$/.test(window.location.hostname)) return;

  const runner = \`(function() {
    if (window.__pfHuntLoaded) return;
    window.__pfHuntLoaded = true;
    try {
      if (window.localStorage.getItem('pf.gameHunt') === 'false') return;
    } catch (_) {}

    const injectStyle = () => {
      if (document.getElementById('pih-ui-css')) return;
      const s = document.createElement('style');
      s.id = 'pih-ui-css';
      s.textContent = \${JSON.stringify(HUNT_CSS)};
      (document.head || document.documentElement)?.appendChild(s);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectStyle, { once: true });
    } else {
      injectStyle();
    }

    // Scripts do /hunt for PokeIdle
    ${scriptsCombined.replace(/`/g, '\\`').replace(/\${/g, '\\${')}
  })()\`;

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

if (typeof window !== 'undefined' && /(^|\\.)pokeidle\\.io$/.test(window.location.hostname)) {
  installPokeidleHunt();
}

if (typeof module !== 'undefined') {
  module.exports = { installPokeidleHunt };
}
`;

const dest = path.join(__dirname, '..', 'pokeidle-hunt.js');
fs.writeFileSync(dest, code, 'utf8');
console.log('pokeidle-hunt.js generated successfully. Size:', code.length);
