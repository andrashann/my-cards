# Third-party libraries

This project's own code is 0BSD (see `LICENSE`), which imposes no conditions at all. The four
libraries bundled in `vendor/` keep their own licenses, and two of them do impose conditions.

| Library | Version | License | Copyright | Text |
| --- | --- | --- | --- | --- |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | 1.4.4 | MIT | 2009 Kazuhiko Arase | `vendor/licenses/qrcode-generator-LICENSE.txt` |
| [JsBarcode](https://github.com/lindell/JsBarcode) | 3.11.6 | MIT | Johan Lindell | `vendor/licenses/jsbarcode-LICENSE.txt` |
| [jsQR](https://github.com/cozmo/jsQR) | 1.4.0 | Apache-2.0 | Cosmo Wolfe | `vendor/licenses/jsqr-LICENSE.txt` |
| [@zxing/library](https://github.com/zxing-js/library) | 0.21.3 | Apache-2.0 | the ZXing authors | `vendor/licenses/zxing-library-LICENSE.txt` |

## Fonts

Both are served from `vendor/fonts/`, so the page makes no third-party request. Each is the latin and
latin-ext subset as published by Google Fonts, unmodified. The latin-ext file is not optional:
Hungarian needs `ő` and `ű`, which the latin subset does not contain.

| Font | Version | License | Copyright | Text |
| --- | --- | --- | --- | --- |
| [Instrument Sans](https://github.com/Instrument/instrument-sans) | v4 | SIL OFL 1.1 | 2022 The Instrument Sans Project Authors | `vendor/licenses/instrument-sans-OFL.txt` |
| [IBM Plex Mono](https://github.com/IBM/plex) | v20 | SIL OFL 1.1 | 2017 IBM Corp., Reserved Font Name "Plex" | `vendor/licenses/ibm-plex-mono-OFL.txt` |

The OFL permits bundling and redistribution, including commercially, as long as the license travels
with the font files and they are not sold on their own. It also forbids releasing a modified version
under a Reserved Font Name, which matters for IBM Plex Mono: "Plex" is reserved, so a modified copy
would need a different name. Neither font has been modified here.

## If you redistribute this

0BSD asks nothing of you, but the bundled libraries do. Keeping the `vendor/` directory intact,
`vendor/licenses/` included, satisfies all four:

- **MIT** (qrcode-generator, JsBarcode) requires the copyright notice and permission text to travel
  with the code.
- **Apache-2.0** (jsQR, @zxing/library) additionally requires a copy of the license, retention of
  existing notices, and that modified files be marked as changed. Neither package ships a `NOTICE`
  file, so there is nothing extra to propagate. None of the vendored files have been modified; they
  are byte-for-byte as published on npm.

Dropping a library you do not use is the cleaner way to shed its obligations. The page needs
qrcode-generator and JsBarcode to draw codes; jsQR and @zxing/library are only needed to read them,
so a build that never scans can omit both and the whole scanning path along with it.

## A note on @zxing/library's license

Its `package.json` declares `MIT`, but the `LICENSE` file it ships is Apache-2.0, inherited from the
original Java ZXing project. The two disagree. This project treats it as Apache-2.0, which is the
conservative reading and the one its actual license file supports. The shipped text also carries a
Sun Microsystems disclaimer appended by the upstream project, including the clause that the software
is not intended for use in operating a nuclear facility.

## Verifying

The versions above are pinned, and every file in `vendor/` was downloaded from jsDelivr. To check a
file has not been tampered with, compare it against the registry:

```sh
curl -sL https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js | shasum -a 256
shasum -a 256 vendor/jsqr-1.4.0.js
```
