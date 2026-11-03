/* Serves the project and runs the browser harnesses in headless Chrome,
   which is the only way to check layout and pointer gestures. Prints each
   report and exits non-zero on a failure.

   Usage: node tests/run-browser-tests.mjs [--show] [name ...]
   --show prints the URLs to open in your own browser instead, to watch them;
   a name runs only the harnesses whose file name contains it. */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PAGES = ['reorder-drag.html', 'code-view.html'];
const args = process.argv.slice(2).filter((a) => a !== '--show');
const SHOW = process.argv.includes('--show');
const pages = args.length
  ? PAGES.filter((p) => args.some((a) => p.includes(a)))
  : PAGES;
if (!pages.length) {
  console.error('no harness matches ' + args.join(' ') + '; have ' + PAGES.join(', '));
  process.exit(2);
}
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.css': 'text/css'
};
const CHROME = process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Each harness posts its report back when it has finished.
let settle = () => {};

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/__result') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    res.writeHead(204).end();
    settle(Buffer.concat(chunks).toString());
    return;
  }
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
const base = `http://127.0.0.1:${server.address().port}/tests/`;

if (SHOW) {
  pages.forEach((p) => console.log('open ' + base + p));
} else {
  let bad = 0;
  for (const page of pages) {
    const report = await new Promise((resolve) => {
      settle = resolve;
      // A throwaway profile, so this never touches the real browser's state,
      // and a window tall enough for the phone-shaped frames inside it.
      const chrome = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--user-data-dir=' + (process.env.TMPDIR || '/tmp') + 'my-cards-test-profile',
        '--window-size=1100,1400', base + page
      ], { stdio: 'ignore' });
      chrome.on('error', (e) => resolve('FAIL  could not start Chrome: ' + e.message));
      const giveUp = setTimeout(() => resolve('FAIL  no report within 40s'), 40000);
      settle = (text) => { clearTimeout(giveUp); chrome.kill(); resolve(text); };
    });
    console.log(page + '\n' + report + '\n');
    if (/FAIL|failing/.test(report)) bad++;
  }
  server.close();
  process.exit(bad ? 1 : 0);
}
