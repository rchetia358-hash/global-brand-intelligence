/**
 * bootstrap.js — installs npm packages using agy-node (no npm CLI needed)
 * Run with: agy-node bootstrap.js
 */
'use strict';
const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const zlib   = require('zlib');
const { execFileSync } = require('child_process');

const NODE = process.execPath;
const CWD  = __dirname;
const NM   = path.join(CWD, 'node_modules');

if (!fs.existsSync(NM)) fs.mkdirSync(NM, { recursive: true });

// ── Minimal package installer ──────────────────────────────────────────────
// Fetches tarball from registry, extracts to node_modules/<pkg>

function get(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'agy-node-bootstrap' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function getJson(url) {
  const buf = await get(url);
  return JSON.parse(buf.toString('utf8'));
}

async function extractTarball(tarBuf, destDir) {
  // Write tarball to /tmp, extract with system tar
  const tmp = `/tmp/_pkg_${Date.now()}.tgz`;
  fs.writeFileSync(tmp, tarBuf);
  fs.mkdirSync(destDir, { recursive: true });
  try {
    execFileSync('tar', ['xzf', tmp, '-C', destDir, '--strip-components=1']);
  } finally {
    fs.unlinkSync(tmp);
  }
}

async function installPkg(name, versionSpec = 'latest', depth = 0) {
  if (depth > 6) return; // safety guard
  const pkgDir = path.join(NM, name.replace('/', path.sep));
  // Check if already installed
  if (fs.existsSync(path.join(pkgDir, 'package.json'))) {
    process.stdout.write(`  ✓ ${name} (cached)\n`);
    return;
  }
  const encodedName = name.startsWith('@') ? name.replace('/', '%2F') : name;
  const metaUrl = `https://registry.npmjs.org/${encodedName}`;
  const meta    = await getJson(metaUrl);
  const version = versionSpec === 'latest'
    ? meta['dist-tags'].latest
    : (meta['dist-tags'][versionSpec] || versionSpec);
  const vdata   = meta.versions[version];
  if (!vdata) throw new Error(`No version ${version} for ${name}`);
  const tarUrl  = vdata.dist.tarball;
  process.stdout.write(`  ↓ ${name}@${version}\n`);
  const tarBuf  = await get(tarUrl);
  await extractTarball(tarBuf, pkgDir);
  // Install direct deps (non-dev)
  const deps = vdata.dependencies || {};
  for (const [dep, ver] of Object.entries(deps)) {
    await installPkg(dep, ver.replace(/^[\^~>=<]+/, '').split(' ')[0] || 'latest', depth + 1);
  }
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(CWD, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies };
  const names = Object.keys(deps);
  console.log(`\nBootstrapping ${names.length} packages into node_modules/…\n`);
  for (const [name] of Object.entries(deps)) {
    try {
      await installPkg(name);
    } catch (e) {
      console.warn(`  ✗ ${name}: ${e.message}`);
    }
  }
  console.log('\n✅ Done. Now starting server…\n');
  // Start the server
  require(path.join(CWD, 'server.js'));
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
