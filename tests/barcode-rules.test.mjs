/**
 * Checks lib/codes.js without a browser: the per-format validation rules,
 * EAN-13 check digits, UPC-E expansion, the auto-format guess, how a
 * decoded barcode is mapped onto a format the page can draw, and the
 * automatic text color.
 *
 *   node tests/barcode-rules.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// lib/codes.js is a classic script that assigns window.CODES. Give it a
// window and a stub document; nothing tested here touches a canvas.
const sandbox = {
  window: {},
  document: { createElement: () => ({ getContext: () => ({}) }) },
  TextEncoder, Promise, Math, Number, String, Array, Object, JSON, RegExp, Error,
};
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(root, 'lib', 'codes.js'), 'utf8'), sandbox);
const C = sandbox.window.CODES;
if (!C) throw new Error('lib/codes.js did not define window.CODES');

let failed = 0;
const report = (ok, label) => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
};

/* ---------------------------- format rules ---------------------------- */
const cases = [
  // [format, payload, should pass?, what the case is for]
  ['EAN_13', '401234567890', true, '12 digits, check digit computed for you'],
  ['EAN_13', '4012345678901', true, '13 digits with the right check digit'],
  ['EAN_13', '4012345678902', false, '13 digits with a wrong check digit'],
  ['EAN_13', '40123456789', false, '11 digits is too short'],
  ['EAN_13', '4012345678901a', false, 'letters are not allowed'],
  ['ITF', '12345678', true, 'even digit count'],
  ['ITF', '1234567', false, 'odd digit count cannot pair up'],
  ['ITF', '12ab', false, 'digits only'],
  ['CODE_39', 'ABC-123 $/+%.', true, 'the full Code 39 character set'],
  ['CODE_39', 'abc', false, 'lower case is outside Code 39'],
  ['CODABAR', 'A12345B', true, 'wrapped in start/stop letters'],
  ['CODABAR', '1234-56', true, 'bare digits and a dash'],
  ['CODABAR', '12E45', false, 'E is not a Codabar character'],
  ['CODE_128', 'Member/42 #7', true, 'any ASCII'],
  ['CODE_128', 'Tölgyfa', false, 'non-ASCII needs a QR code'],
  ['QR_CODE', 'https://example.org/x?y=1', true, 'QR takes anything'],
  ['QR_CODE', 'Tölgyfa utca 3.', true, 'including non-ASCII'],
  ['QR_CODE', '', false, 'an empty payload is never valid'],
  ['PDF_417', 'x', false, 'a format the page cannot draw is rejected'],
];

for (const [fmt, payload, shouldPass, why] of cases) {
  const problem = C.validate(fmt, payload);
  const passed = problem === null;
  report(passed === shouldPass,
    `${fmt} ${shouldPass ? 'accepts' : 'rejects'} ${JSON.stringify(payload)} — ${why}` +
    (passed === shouldPass ? '' : ` (got ${JSON.stringify(problem)})`));
}

/* ---------------------------- check digit ---------------------------- */
for (const [twelve, want] of [
  ['401234567890', '1'],   // the example the page offers
  ['590123412345', '7'],
  ['000000000000', '0'],
]) {
  const got = C.ean13CheckDigit(twelve);
  report(got === want, `EAN-13 check digit for ${twelve} is ${want}${got === want ? '' : ` (got ${got})`}`);
}

/* --------------------------- UPC-E expansion ---------------------------
 * A UPC-E carries the check digit of its expanded form, so the test
 * builds each input the way a real one is built: rearrange the digits,
 * then take the check digit that expansion requires. One documented pair
 * is pinned outright so the rearrangement itself is checked, not just its
 * self-consistency.
 */
report(C.upcEToEan13('01234565') === '0012345000065',
  `the documented pair UPC-E 01234565 expands to 0012345000065 (got ${C.upcEToEan13('01234565')})`);

for (const [sys, body] of [
  ['0', '127890'],  // last digit 0
  ['0', '421001'],  // last digit 1
  ['0', '345672'],  // last digit 2
  ['0', '512343'],  // last digit 3
  ['0', '678904'],  // last digit 4
  ['0', '123456'],  // last digit 5 and up
  ['1', '987659'],
]) {
  // The check digit is ignored by the rearrangement, so a placeholder is
  // enough to find out which one the expanded number needs.
  const probe = C.upcEToEan13(sys + body + '0');
  const check = C.ean13CheckDigit(probe.slice(0, 12));
  const full = C.upcEToEan13(sys + body + check);
  report(full !== null && full.length === 13 && C.validate('EAN_13', full) === null,
    `UPC-E ${sys + body + check} (last digit ${body[5]}) expands to a valid EAN-13 (${full})`);
}
report(C.upcEToEan13('123') === null, 'a malformed UPC-E expands to null rather than nonsense');

/* ------------------------- the auto-format guess ------------------------- */
for (const [payload, want] of [
  ['4012345678901', 'EAN_13'],      // valid 13-digit product code
  ['401234567890', 'EAN_13'],       // 12 digits, check digit to be added
  ['4012345678902', 'CODE_128'],    // 13 digits but a bad check digit
  ['MEMBER-4821', 'CODE_128'],
  ['https://example.org', 'CODE_128'],
  ['Tölgyfa utca', 'QR_CODE'],      // non-ASCII has to be QR
  ['', 'QR_CODE'],
]) {
  const got = C.autoFormat(payload);
  report(got === want, `auto picks ${want} for ${JSON.stringify(payload)}${got === want ? '' : ` (got ${got})`}`);
}

// Whatever auto picks must itself validate, or the editor would offer a
// format it then refuses to save.
for (const payload of ['4012345678901', '401234567890', 'MEMBER-4821', 'Tölgyfa utca', 'a'.repeat(300)]) {
  const fmt = C.autoFormat(payload);
  report(C.validate(fmt, payload) === null,
    `auto's choice of ${fmt} validates for ${JSON.stringify(payload.slice(0, 20))}`);
}

/* --------------------- adopting a scanned barcode --------------------- */
for (const [detected, text, wantFmt, wantText] of [
  ['UPC_A', '012345678905', 'EAN_13', '0012345678905'],  // gains a leading zero
  ['UPC_E', '01234565', 'EAN_13', '0012345000065'],
  // A UPC-E whose check digit does not survive expansion is kept as a QR
  // code rather than written out as an EAN-13 no scanner would accept.
  ['UPC_E', '01278906', 'QR_CODE', '0012000007896'],
  ['EAN_8', '96385074', 'QR_CODE', '96385074'],          // cannot be drawn
  ['PDF_417', 'lots of data', 'QR_CODE', 'lots of data'],
  ['AZTEC', 'abc', 'QR_CODE', 'abc'],
  ['DATA_MATRIX', 'xyz', 'QR_CODE', 'xyz'],
  ['CODE_128', 'ABC123', 'CODE_128', 'ABC123'],          // passes through
  ['QR_CODE', 'hello', 'QR_CODE', 'hello'],
  ['CODE_39', 'AB-12', 'CODE_39', 'AB-12'],
]) {
  const got = C.adopt({ format: detected, text });
  report(got.format === wantFmt && got.text === wantText,
    `${detected} adopted as ${wantFmt}${wantText !== text ? ` with the number rewritten to ${wantText}` : ''}` +
    (got.format === wantFmt && got.text === wantText ? '' : ` (got ${got.format} / ${got.text})`));
}

// Anything adopted must be drawable, whatever the reader returned: an
// adopted card that cannot render is the one failure the user cannot fix.
for (const [detected, text] of [
  ['CODE_39', 'lower case fails code39'], ['ITF', '12345'], ['EAN_13', '99'],
  ['CODABAR', 'ZZZ'], ['UPC_E', 'not-a-upce'], ['WHO_KNOWS', 'anything'],
  ['CODE_128', 'Tölgyfa'],
]) {
  const got = C.adopt({ format: detected, text });
  report(C.validate(got.format, got.text) === null && !!C.FORMATS[got.format],
    `a bad ${detected} payload still adopts to something drawable (${got.format})`);
  report(typeof got.note === 'string', `and explains the substitution`);
}

/* ----------------------------- the tables ----------------------------- */
report(C.ORDER.length === 6 && C.ORDER.every((k) => C.FORMATS[k]),
  `all offered formats are real (${C.ORDER.join(', ')})`);
report(Object.keys(C.FORMATS).every((k) => k === 'QR_CODE' || C.FORMATS[k].enc),
  'every format except QR has a JsBarcode encoder behind it');
report(Object.keys(C.FORMATS).length === C.ORDER.length,
  'every known format is offered in the picker, with none orphaned');
report(Object.values(C.SUBSTITUTE).every((s) => C.FORMATS[s.to] && s.why),
  'every substitution targets a drawable format and says why');

/* ------------------------------- contrast -------------------------------
 * autoFg chooses between white and near-black, so for a mid-tone
 * background neither option can reach 4.5:1. What it must guarantee is
 * that it picks the better of the two and never drops below the 3:1 floor
 * for large text, which is what a card name is. The measured ratio is
 * printed so a palette change that costs contrast is visible.
 */
const WHITE = [255, 255, 255];
const NEAR_BLACK = [17, 17, 17];
const SWATCHES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300',
                  '#4a3aa7', '#e34948', '#1f2126', '#565c66'];
for (const hex of SWATCHES) {
  const bg = C.fromHex(hex);
  const fg = C.autoFg(bg);
  const got = C.contrast(bg, fg);
  const best = Math.max(C.contrast(bg, WHITE), C.contrast(bg, NEAR_BLACK));
  report(Math.abs(got - best) < 1e-9,
    `${hex} takes the higher-contrast text of the two (${got.toFixed(2)}:1, ${fg[0] > 128 ? 'white' : 'near-black'})`);
  report(got >= 3, `${hex} clears the 3:1 floor for large text (${got.toFixed(2)}:1)`);
  report(C.contrast(bg, C.autoLabel(bg)) >= 3,
    `${hex} keeps labels at 3:1 or better (${C.contrast(bg, C.autoLabel(bg)).toFixed(2)}:1)`);
}

// Which swatches cannot carry small body text, stated rather than assumed.
const belowAA = SWATCHES.filter((hex) => C.contrast(C.fromHex(hex), C.autoFg(C.fromHex(hex))) < 4.5);
console.log(`note  swatches under 4.5:1 for small text: ${belowAA.join(', ') || 'none'}`);

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
