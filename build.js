#!/usr/bin/env bun
import { copyFileSync } from 'fs';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const outdir = 'dist';

// 1. Build
const result = await Bun.build({
  entrypoints: ['index.html'],
  outdir,
  minify: true,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// 2. Copy Pages files
copyFileSync('CNAME', join(outdir, 'CNAME'));
copyFileSync('.nojekyll', join(outdir, '.nojekyll'));

// 3. Strip the import map from the built index.html (bundled deps make it stale)
const htmlPath = join(outdir, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/m, '');
writeFileSync(htmlPath, html);

console.log('dist/ ready for GitHub Pages');
