# My Cards

Loyalty cards on your phone without installing anything. Scan a card's barcode with the camera, then
tap the card at the till and the barcode fills the screen, big enough for a scanner to read off the
glass.

One static page. Everything runs in the browser: no account, no server, and nothing is ever
uploaded. The libraries and the fonts are all served from the page's own origin, so it makes no
third-party request of any kind and works with no network at all.

## Using it

**Scan** opens the camera, and the barcode is read live: hold the card so it fills the frame. On
phones with a camera light there is a **Light** button, which helps for a worn card. If the camera is
unavailable there is a "use a picture instead" fallback that reads a screenshot or photo from your
library.

**Type** is there when the number is printed on the card but the barcode is damaged or missing.
Leave the type as "work it out from the number" and it guesses: thirteen digits with a valid check
digit is an EAN-13, other ASCII becomes Code 128, anything else becomes a QR code. That guess is
only a guess, so if a till refuses the card, scan the real barcode or set the type by hand.

To reorder the list, drag a card where you want it. On a phone, hold it still for a moment first, so
that a flick still scrolls the list; with a mouse it picks up as soon as you move. Escape puts a card
back mid-drag. From a keyboard, focus a card and hold Alt while pressing an arrow key.

Cards are kept in this browser's `localStorage`. They are not synced anywhere, which is the point,
but it also means clearing site data wipes them, so there is an export button and an import button
beside it.

`sample_cards.json` holds eight made-up cards, one of every format the page can draw, with a
different color each. Import it to see what a full list looks like before putting your own cards in.
The names and numbers are invented, so none of them will scan at a till. Importing it again later
replaces those eight rather than adding another eight, and deleting them one by one leaves whatever
else you have added alone.

### On a phone

Open it in Safari, then Share and **Add to Home Screen**. You get an icon that opens full screen with
no address bar, and `sw.js` caches everything, so your cards still come up in a shop with no signal.

This needs the folder served over HTTPS. Opened as a `file://` URL the page still works, but the
camera is unavailable, because browsers only grant camera access to a secure origin.

### Updating a published copy

An installed copy runs from the service worker's cache, so a deploy reaches it through the worker
rather than through the browser. Bump `CACHE` in `sw.js` every time you publish: changing those
bytes is what makes the browser install the new worker, and only a new worker re-downloads the
files. The page notices the handover and reloads itself, so the first launch after a deploy updates
itself a moment after opening rather than showing the old version until the launch after that. It
waits if a card, the scanner, or the editor is open, so nothing disappears while you are using it.
Forget the bump and the update still arrives, one launch later, through the background refresh.

The host's own cache header sets the floor on how soon the browser sees the new `sw.js`: ten
minutes on GitHub Pages.

Saved cards are not touched by any of this. They are in `localStorage`, which the worker never
writes and a new worker never clears, and a reload does not disturb. Clearing the site's data or
removing the home screen icon is what loses them, so export a backup before doing either.

### Sharing a link

`og-image.png` is what a chat app, a feed, or a message shows when someone posts the page: 1200 by
630, the size every unfurler expects. It is drawn from `tools/og-image.html` with the page's own
fonts, palette, and card shapes, so edit that file and run `node tools/make-og-image.mjs` to redraw
it rather than editing the PNG.

An unfurler never runs the page's scripts, so the picture has to be a file sitting next to the page
and `og:image` has to name it absolutely. That writes the published address into `index.html`, in
three lines marked with a comment, and that is the only place it appears: the picture names no host,
so hosting this elsewhere means editing those three lines and nothing else. The image stays out of
the service worker's precache, since nothing but a crawler ever asks for it.

## How it shows a code

The code view is always white with black bars, whatever theme the rest of the page is in: a scanner
reads reflectance, so a dark card would simply not scan. A 1D barcode is shown the way it is
printed, as wide as the screen allows, which is the orientation a till expects. **Turn** rotates it
ninety degrees instead: on a portrait screen that makes the bars a good deal longer, which helps a
scanner that is struggling. The page also asks for a screen wake lock, which most iOS versions
decline, so it may still dim.

## Barcode formats

Drawn: QR, Code 128, EAN-13, Code 39, Codabar, and ITF. Each one is validated before a card can be
saved, with a message that says what is wrong rather than just "invalid": an EAN-13 needs 12 or 13
digits and a correct check digit, ITF needs an even number of digits because it encodes them in
pairs, Code 39 has its own character set, and so on.

The readers recognize more than the page can draw. UPC-A and UPC-E are converted to the EAN-13 they
really are, and anything else (PDF417, Aztec, Data Matrix, EAN-8) keeps its data in a QR code, with a
note in the editor saying what was substituted and why. Nothing is ever saved in a format that cannot
be drawn.

## Layout

```
index.html                 the page
lib/codes.js               formats, validation, drawing, reading, color
sw.js                      offline cache
manifest.webmanifest       so it installs to a home screen
icon.svg                   app icon
og-image.png               the picture a shared link unfurls into
sample_cards.json          eight made-up cards, for the import button
tools/                     redraws og-image.png; nothing the page loads
vendor/                    pinned libraries, no CDN
tests/                     node tests for lib/codes.js, and browser tests for the page
```

### Libraries

Vendored at these versions, about 700 kB in total:

| File | Used for | License |
| --- | --- | --- |
| `qrcode-generator-1.4.4.js` | drawing QR codes | MIT |
| `jsbarcode-3.11.6.all.min.js` | drawing Code 128, Code 39, EAN-13, Codabar, and ITF | MIT |
| `zxing-library-0.21.3.umd.min.js` | reading 1D barcodes from the camera or a picture | Apache-2.0 |
| `jsqr-1.4.0.js` | reading QR codes from the camera or a picture | Apache-2.0 |

The two readers are about 600 kB of that, so they load only when you first scan something. The
service worker precaches them anyway, so scanning also works offline.

The two fonts, Instrument Sans and IBM Plex Mono, are in `vendor/fonts/` as latin and latin-ext
woff2 subsets, 60 kB in total. They are self-hosted rather than linked from Google Fonts, so the
page makes no third-party request and nobody's IP address is handed to anyone when they open it.
Both are SIL OFL 1.1; see `THIRD-PARTY.md`.

## License

The code here is [0BSD](https://opensource.org/license/0bsd), in `LICENSE`. Do anything you like with
it, with no conditions: no attribution, no notice to keep, no permission to ask. It does disclaim
warranties and limits liability.

The bundled libraries keep their own licenses, and the two Apache-2.0 ones do impose conditions on
anyone redistributing the project. `THIRD-PARTY.md` lists them, with the full texts in
`vendor/licenses/`.

## Tests

```sh
node tests/barcode-rules.test.mjs
```

101 checks. Runs `lib/codes.js` in a sandbox and covers the per-format validation rules, EAN-13 check
digits, UPC-E expansion against a documented pair, the auto-format guess, and the mapping of scanned
formats onto drawable ones, including that every substitution produces something that actually
renders. It also checks that the automatic text color always takes the higher-contrast option, and
prints which card colors fall under 4.5:1 for small text rather than silently passing: `#2a78d6`
reaches 4.42:1, which clears the 3:1 bar for a card name but not the 4.5:1 bar for the small number
underneath it.

```sh
node tests/run-browser-tests.mjs
```

86 checks that need real layout, real gestures, a real service worker, or real pixels, so they
cannot run in node: this serves the project to headless Chrome and drives six harnesses against
it.

`tests/reorder-drag.html` is 24 checks on reordering: a mouse drag up and down a single column, a
sideways drag in the two-column layout, a touch drag that holds first and a flick that does not, the
saved order, Escape mid-drag, the keyboard move with its focus and announcement, and that a plain
tap still opens the barcode while the tap left behind by a drop does not.

`tests/code-view.html` is 15 checks on the full-screen barcode in a phone-shaped frame: that a 1D
code opens flat, that **Turn** rotates it and back, that it is centered and wholly on screen either
way, and that a QR code has no Turn button.

`tests/sw-update.html` is 10 checks on what an installed copy does when a new one is published under
it. The server stamps a build number into the page and into the worker's cache name, so moving it on
is a deploy: the page must land on the new build by reloading itself exactly once, must then stay
put rather than loop, must wait while a card is open and land as soon as it is put away, and must
leave the saved cards alone throughout.

`tests/icon.html` is 11 checks on the home screen icon. iOS ignores the SVG in the manifest and
takes the `apple-touch-icon`, which the page draws on a canvas, so the two can drift apart without
anyone noticing until it is on a phone. It reads the rectangles out of `icon.svg`, measures the
drawn PNG pixel by pixel, and requires nine bars in the places the file puts them, a rule flush
with the first and last of them, and the whole mark centered in the tile.

`tests/import-sample.html` is 12 checks that put `sample_cards.json` through the page's own Import
backup button rather than reading it and trusting it: every card arrives, in order, keeping its
type, number, label, and color, every one of them draws, the eight between them cover all six
drawable formats, and importing the file twice replaces rather than duplicates.

`tests/share-preview.html` is 14 checks on the link preview, reading `index.html` as text the way a
crawler gets it rather than as a built DOM: every Open Graph and Twitter tag is set, the title and
description match the page's own, both URLs are absolute, the image sits beside the page it
previews, and the file it names is really in the repo, served as a PNG, of a sensible size, and
1200 by 630 as the tags claim.

Name a harness to run only that one (`node tests/run-browser-tests.mjs code-view`), or add `--show`
for URLs to open in your own browser and watch. It expects Chrome at the usual macOS path;
`CHROME=/path/to/chrome` overrides that.
