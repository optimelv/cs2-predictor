import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const themeSource = await readFile(new URL('../docs/theme.js', import.meta.url), 'utf8');
function fixture(saved, dark = false, blocked = false) {
  const listeners = {}, controlListeners = {}, mediaListeners = {};
  const control = { value: '', addEventListener: (type, callback) => { controlListeners[type] = callback; } };
  const document = { documentElement: { dataset: {}, style: {} }, querySelector: () => control, addEventListener: (type, callback) => { listeners[type] = callback; } };
  const media = { matches: dark, addEventListener: (type, callback) => { mediaListeners[type] = callback; } };
  const storage = { getItem: () => { if (blocked) throw Error(); return saved; }, setItem: (_key, value) => { if (blocked) throw Error(); saved = value; } };
  vm.runInNewContext(themeSource, { document, matchMedia: () => media, localStorage: storage, addEventListener: (type, callback) => { listeners[type] = callback; } });
  listeners.DOMContentLoaded();
  return { document, media, control, listeners, mediaListeners, set: (value) => controlListeners.change({ target: { value } }), saved: () => saved };
}
const initial = fixture(null);
assert.equal(initial.document.documentElement.dataset.theme, 'dark');
assert.equal(initial.document.documentElement.style.colorScheme, 'dark');
initial.set('light');
assert.equal(initial.saved(), 'light');
assert.equal(initial.document.documentElement.style.colorScheme, 'light');
initial.set('system');
initial.media.matches = true;
initial.mediaListeners.change();
assert.equal(initial.document.documentElement.dataset.theme, 'dark');
initial.listeners.storage({ key: 'strikesignal-appearance', newValue: 'light' });
assert.equal(initial.control.value, 'light');
assert.equal(fixture('invalid').document.documentElement.dataset.theme, 'dark');
const blocked = fixture(null, false, true);
assert.doesNotThrow(() => blocked.set('light'));
assert.equal(blocked.document.documentElement.dataset.theme, 'light');

const css = await readFile(new URL('../docs/workspace.css', import.meta.url), 'utf8');
const tokens = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
const light = tokens(css.match(/:root \{([\s\S]*?)\}/)[1]);
const dark = { ...light, ...tokens(css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\}/)[1]) };
const resolve = (name, theme) => {
  const value = theme[name];
  return value.startsWith('var(') ? resolve(value.slice(4, -1), theme) : value;
};
const luminance = (hex) => {
  const rgb = hex.replace('#', '');
  const full = rgb.length === 3 ? [...rgb].map((n) => n + n).join('') : rgb;
  const values = full.match(/../g).map((n) => parseInt(n, 16) / 255).map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
};
const pairs = [
  ['--color-text-primary', '--color-bg-page'], ['--color-text-secondary', '--color-bg-surface'],
  ['--color-accent', '--color-accent-soft'], ['--color-on-accent', '--color-accent-solid'],
  ['--color-warning-strong', '--color-warning-bg'], ['--color-warning-text', '--color-warning-bg'],
];
const consumerCss = await readFile(new URL('../docs/consumer.css', import.meta.url), 'utf8');
const consumerLight = { ...light, ...tokens(consumerCss.match(/:root \{([\s\S]*?)\}/)[1]) };
const consumerDark = { ...dark, ...consumerLight, ...tokens(consumerCss.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\}/)[1]) };
assert.doesNotMatch(consumerCss, /data-accent|#278dff|#73c6ff|#7096ff/i);
for (const [mode, theme] of Object.entries({ consumerLight, consumerDark })) {
  for (const [foreground, background] of pairs) {
    const a = luminance(resolve(foreground, theme)), b = luminance(resolve(background, theme));
    const contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    assert.ok(contrast >= 4.5, `${mode} ${foreground}/${background}: ${contrast.toFixed(2)}:1`);
  }
}
for (const name of ['sora-latin.woff2', 'sora-latin-ext.woff2']) {
  const font = await readFile(new URL(`../docs/fonts/${name}`, import.meta.url));
  assert.equal(font.subarray(0, 4).toString(), 'wOF2');
}
console.log('Native theme, storage fallback, orange consumer palette contrast pairs and local font files passed');
