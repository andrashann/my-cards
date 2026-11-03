/* Serves the project and runs tests/reorder-drag.html in headless Chrome,
   which is the only way to exercise a drag: it needs real layout and real
   pointer events. Prints the harness report and exits non-zero on a failure.

   Usage: node tests/run-reorder-drag.mjs [--show]
   --show opens the harness in your own browser instead, to watch it. */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SHOW = process.argv.includes('--show');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.css': 'text/css'
};
const CHROME = process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let settle;
const done = new Promise((r) => { settle = r; });

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
const url = `http://127.0.0.1:${server.address().port}/tests/reorder-drag.html`;

if (SHOW) {
  console.log('open ' + url);
} else {
  // A throwaway profile, so this never touches the real browser's state, and
  // a window big enough that the two-column list is really two columns.
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + (process.env.TMPDIR || '/tmp') + 'my-cards-drag-profile',
    '--window-size=1100,1400', url
  ], { stdio: 'ignore' });
  chrome.on('error', (e) => { settle('FAIL  could not start Chrome: ' + e.message); });
  setTimeout(() => settle('FAIL  the harness did not report within 40s'), 40000);
  const report = await done;
  chrome.kill();
  server.close();
  console.log(report);
  process.exit(/FAIL|failing/.test(report) ? 1 : 0);
}
