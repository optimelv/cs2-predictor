import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

await build({
  entryPoints: ['ui/charts/engine.tsx'],
  outfile: 'docs/vendor/chart-engine.js',
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'linked',
});
const bytes = readFileSync('docs/vendor/chart-engine.js');
console.log(`Chart bundle: ${(bytes.length / 1024).toFixed(1)} KiB; ${(gzipSync(bytes).length / 1024).toFixed(1)} KiB gzip. Loaded only when a chart becomes visible.`);
