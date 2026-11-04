/* Renders tools/og-image.html to og-image.png, the picture a link unfurler
   shows when the page is shared. 1200x630, which is what every unfurler
   expects, drawn with the page's own fonts, so it has to go through a real
   browser rather than an image library.

     node tools/make-og-image.mjs

   Run it after editing tools/og-image.html, and commit both. */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'og-image.png');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png'
};
const CHROME = process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const server = createServer(async (req, res) => {
  const path = join(ROOT, normalize(decodeURIComponent(req.url.split('?')[0])));
  if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/tools/og-image.html`;

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + (process.env.TMPDIR || '/tmp') + 'my-cards-og-profile',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1200,630', '--screenshot=' + OUT,
  // Long enough for the two woff2 files to load; a fallback font would be
  // baked into the image for good.
  '--virtual-time-budget=4000', url
], { stdio: 'ignore' });

const code = await new Promise((r) => chrome.on('exit', r));
server.close();
if (code !== 0) { console.error('Chrome exited ' + code); process.exit(1); }

const { size } = await stat(OUT);
console.log(`og-image.png written, ${(size / 1024).toFixed(0)} kB`);
