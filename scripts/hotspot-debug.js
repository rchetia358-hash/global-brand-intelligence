'use strict';
// Dev helper: writes scripts/hotspot-debug.html showing every hotspot outlined + labelled on the image.
// Usage: node scripts/hotspot-debug.js && open scripts/hotspot-debug.html
const fs = require('fs');
const path = require('path');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'city-hotspots.json'), 'utf8'));
const { width: W, height: H } = cfg.image;
const rects = cfg.hotspots.map(h =>
  `<rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" fill="rgba(255,255,0,.25)" stroke="#0f0" stroke-width="1.5"/>` +
  `<text x="${h.x}" y="${h.y - 2}" font-size="11" font-family="Arial" fill="#0ff" stroke="#000" stroke-width=".4">${h.label}</text>`).join('\n');
fs.writeFileSync(path.join(__dirname, 'hotspot-debug.html'),
`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#222">
<div style="position:relative;width:${W}px;height:${H}px">
<img src="../public/images/fashion-city.jpg" width="${W}" height="${H}" style="display:block">
<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="position:absolute;inset:0">${rects}</svg></div>`);
console.log('wrote scripts/hotspot-debug.html');
