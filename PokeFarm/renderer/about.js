'use strict';
const version = new URLSearchParams(window.location.search).get('version');
const $ = id => document.getElementById(id);
let selected = null;
let selectedButton = null;
$('version').textContent = version ? `Versão ${version}` : 'PokeFarm';

function showDonation(profile, button) {
  selected = profile;
  selectedButton = button;
  $('donation-title').textContent = profile.title;
  $('donation-name').textContent = profile.name;
  $('donation-message').textContent = profile.message;
  $('donation-emoji').textContent = profile.emoji;
  $('donation-qr').src = `../assets/donations/${profile.qr}`;
  $('donation-qr').alt = `QR Code Pix para apoiar ${profile.name}`;
  $('donation-github').href = profile.github;
  $('donation-linkedin').href = profile.linkedin;
  $('copy-status').textContent = '';
  $('about-screen').hidden = true;
  $('donation-screen').hidden = false;
  $('donation-back').focus();
}

function showAbout() {
  selected = null;
  $('donation-screen').hidden = true;
  $('about-screen').hidden = false;
  selectedButton?.focus();
}

window.pfAbout.get().then(config => {
  $('repository').href = config.repository;
  for (const profile of config.developers) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'developer'; button.textContent = profile.name;
    button.title = `Apoiar ${profile.name}`;
    button.addEventListener('click', () => showDonation(profile, button));
    $('developers').append(button);
  }
}).catch(() => { $('about-error').textContent = 'Não foi possível carregar os dados dos desenvolvedores.'; });

$('copy-pix').addEventListener('click', async () => {
  const profile = selected;
  if (!profile) return;
  let copied = false;
  try { copied = await window.pfAbout.copyPix(profile.id); } catch (_) { /* permite tentar novamente */ }
  if (selected === profile) $('copy-status').textContent = copied ? 'Código Pix copiado!' : 'Não foi possível copiar. Tente novamente.';
});
$('donation-back').addEventListener('click', showAbout);
document.querySelector('#close').addEventListener('click', () => window.close());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { if (selected) showAbout(); else window.close(); }
});
