'use strict';
const { resolveVersion } = require('./app-version');
const pkg = require('./package.json');
const version = resolveVersion({ fallbackVersion: pkg.version, releaseVersion: process.env.RELEASE_VERSION });

module.exports = {
  ...pkg.build,
  extraMetadata: { version },
  // Campos nativos do Windows/macOS usam somente a parte numérica.
  buildVersion: version.split('+')[0],
  mac: { ...pkg.build.mac, bundleShortVersion: version.split('+')[0] },
};
