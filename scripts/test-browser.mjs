import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Run `npm run dev` first. A separate browser session never changes your desk.
const url = 'http://127.0.0.1:4173/';
const session = `strikesignal-check-${process.pid}`;
const output = resolve('outputs/browser-check');
mkdirSync(output, { recursive: true });
const run = (...args) => execFileSync('npx', ['--yes', 'agent-browser@0.38.1', '--session', session, ...args], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 }).trim();
const evaluate = (expression) => {
  const result = JSON.parse(run('eval', `JSON.stringify(${expression})`));
  return typeof result === 'string' ? JSON.parse(result) : result;
};
const click = (selector) => run('click', selector);
const wait = (expression) => run('wait', '--fn', expression);
const at = (selector) => evaluate(`(() => { document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'}); return true; })()`);
const screenshot = (name) => run('screenshot', resolve(output, `${name}.png`));
const noOverflow = () => {
  const size = evaluate('({ width: innerWidth, content: document.documentElement.scrollWidth })');
  assert.ok(size.content <= size.width + 1, `Page must not overflow at ${size.width}px (content ${size.content}px)`);
};
const dialogOpen = (id) => wait(`document.querySelector('#${id}').classList.contains('is-open')`);

assert.equal((await fetch(url)).ok, true, 'Start npm run dev before browser checks');
try {
  run('set', 'viewport', '1440', '1000');
  run('open', url);
  wait("document.body.classList.contains('product-ready')");
  wait("document.fonts.check('14px Sora')");
  assert.equal(evaluate("document.documentElement.dataset.theme"), 'dark');
  assert.equal(evaluate("getComputedStyle(document.body).fontFamily.includes('Sora')"), true);
  run('select', '#themePreference', 'light');
  assert.equal(evaluate("getComputedStyle(document.documentElement).colorScheme"), 'light');
  run('reload');
  wait("document.body.classList.contains('product-ready')");
  assert.equal(evaluate("document.documentElement.dataset.theme"), 'light');
  run('select', '#themePreference', 'system');
  run('set', 'media', 'dark');
  wait("document.documentElement.dataset.theme === 'dark'");
  run('set', 'media', 'light');
  wait("document.documentElement.dataset.theme === 'light'");
  run('select', '#themePreference', 'dark');
  console.log('PASS: native dark/light/system modes, persistence, OS change and local Sora font');
  assert.equal(evaluate("document.querySelector('#sourceStatus').dataset.state"), 'stale', 'The bundled July snapshot must not be called live');
  assert.equal(evaluate("[...document.querySelectorAll('[data-save-match-pick]')].every(button => button.disabled)"), true);
  noOverflow();
  screenshot('desktop');

  click('[data-match-filter="picks"]');
  assert.equal(evaluate("!!document.querySelector('[data-reset-match-filters]')"), true);
  assert.equal(evaluate('document.activeElement.dataset.matchFilter'), 'picks');
  click('[data-reset-match-filters]');
  assert.ok(evaluate("document.querySelectorAll('[data-match-key]').length") > 0);
  assert.equal(evaluate('document.activeElement.dataset.matchFilter'), 'all');
  click('#sourceStatus summary');
  click('#refreshSource');
  wait("!document.querySelector('#refreshSource').disabled");
  assert.equal(evaluate("document.querySelector('#sourceStatus').dataset.state"), 'stale');
  console.log('PASS: stale-source guard, retry, pick lock and filter recovery');

  click('#openSearch');
  run('fill', '#productSearch', 'Spirit');
  run('press', 'ArrowDown');
  assert.equal(evaluate('document.activeElement.dataset.searchTeam'), 'Spirit');
  run('eval', "document.querySelector('#searchClose').focus()");
  run('press', 'Shift+Tab');
  assert.equal(evaluate("document.querySelector('#searchResults').contains(document.activeElement)"), true);
  run('press', 'Escape');
  assert.equal(evaluate("document.querySelector('#searchLayer').hidden"), true);
  assert.equal(evaluate('document.activeElement.id'), 'openSearch');
  assert.equal(evaluate("document.querySelector('main').inert"), false);
  console.log('PASS: search arrows, focus containment, Escape and focus return');

  click('#deciderGrid [data-open-veto]');
  dialogOpen('vetoLabLayer');
  assert.equal(evaluate("document.querySelectorAll('[data-veto-map]').length"), 7);
  click('[data-veto-auto]');
  assert.equal(evaluate("document.querySelectorAll('.veto-sequence .is-ban, .veto-sequence .is-pick, .veto-sequence .is-decider').length"), 7);
  click('[data-veto-undo]');
  assert.equal(evaluate("document.querySelectorAll('.veto-sequence .is-ban, .veto-sequence .is-pick, .veto-sequence .is-decider').length"), 5);
  run('press', 'Escape');
  wait("document.querySelector('#vetoLabLayer').hidden");
  assert.equal(evaluate('document.activeElement.hasAttribute("data-open-veto")'), true);
  console.log('PASS: empty event-pool fallback, seven-step veto, undo and return focus');

  click('.top-nav [href="#events"]');
  click('#eventsGrid .event-card:first-child [data-event-open]');
  click('[data-event-view="bracket"]');
  assert.ok(evaluate("document.querySelector('#swissBoard').textContent.length") > 100);
  click('[data-event-view="format"]');
  assert.ok(evaluate("document.querySelector('#swissBoard').textContent.length") > 100);
  click('.top-nav [href="#rankings"]');
  click('#rankingToggle');
  assert.equal(evaluate("document.querySelector('#rankingToggle').getAttribute('aria-expanded')"), 'true');
  click('.browse-tabs [href="#players"]');
  click('#playerDetail [data-watch-type="players"]');
  assert.equal(evaluate("document.querySelector('#openMyDesk').getAttribute('aria-label').includes('1 followed')"), true);
  click('#openMyDesk');
  wait("document.body.dataset.productPage === 'picks'");
  assert.equal(evaluate("document.querySelector('#myDeskContent').textContent.includes('donk')"), true);
  click('.top-nav [href="#rankings"]');
  click('.browse-tabs [href="#players"]');
  click('#playerDetail [data-compare-player]');
  run('fill', '#playerSearch', 'ZywOo');
  click('#playerGrid [data-player-id="hltv:11893"]');
  click('#playerDetail [data-compare-player]');
  dialogOpen('playerCompareLayer');
  assert.equal(evaluate("document.querySelectorAll('[data-compare-slot]').length"), 2);
  screenshot('player-compare');
  run('press', 'Escape');
  wait("document.querySelector('#playerCompareLayer').hidden");
  console.log('PASS: tournament views, rankings, following, personal desk and player comparison');

  click('.top-nav [href="#events"]');
  for (const width of [1280, 900, 760, 620, 390, 320]) {
    run('set', 'viewport', String(width), '844');
    noOverflow();
    assert.equal(evaluate("[...document.querySelectorAll('.event-card-main')].every(node => node.getBoundingClientRect().width > 100)"), true, `Event names must stay readable at ${width}px`);
    if (width === 390) {
      screenshot('mobile-events');
      click('.mobile-dock [href="#matches"]'); screenshot('mobile-matches');
      click('.mobile-dock [href="#events"]');
    }
  }
  console.log('PASS: 1440, 1280, 900, 760, 620, 390 and 320px widths; event-name layout');

  run('set', 'media', 'light', 'reduced-motion');
  click('.mobile-dock [href="#matches"]');
  at('#deciderGrid [data-open-veto]');
  click('#deciderGrid [data-open-veto]');
  dialogOpen('vetoLabLayer');
  assert.equal(evaluate("getComputedStyle(document.querySelector('.veto-lab')).transform"), 'none');
  run('press', 'Escape');
  wait("document.querySelector('#vetoLabLayer').hidden");
  assert.equal(evaluate("document.querySelector('main').inert"), false);
  assert.equal(run('errors'), '', 'Browser must not report uncaught errors');
  console.log('PASS: reduced-motion modal, keyboard dismissal, no uncaught browser errors');
  console.log(`Screenshots: ${output}`);
} finally {
  try { run('close'); } catch { /* Preserve the original test failure. */ }
}
