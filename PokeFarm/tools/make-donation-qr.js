'use strict';
const path = require('node:path');
const QRCode = require('qrcode');
const config = require('../assets/donations/developers.json');

// Gera imagens locais: nenhum Pix é enviado a um serviço de QR Code.
Promise.all(config.developers.map(profile => QRCode.toFile(
  path.join(__dirname, '..', 'assets', 'donations', profile.qr), profile.pix,
  { errorCorrectionLevel: 'M', margin: 4, scale: 8, color: { dark: '#000000', light: '#ffffff' } },
))).catch(error => { console.error(error); process.exitCode = 1; });
