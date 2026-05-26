#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { buildRawIconPng } = require('../src/main/tray-icon');

const outDir = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const pngPath = path.join(outDir, '512x512.png');
fs.writeFileSync(pngPath, buildRawIconPng(512));
console.log(`Written: ${pngPath}`);
console.log('');
console.log('Next step -- generate the Windows ICO:');
console.log('  convert assets/icons/512x512.png -define icon:auto-resize=256,128,64,48,32,16 assets/icons/icon.ico');
