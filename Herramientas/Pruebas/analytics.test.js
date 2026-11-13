'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../../js/consent-mode'), 'utf8');
const preference = 'laqp_cookie_consent_v1';

function setup(address, saved) {
  const location = new URL(address);
  const storage = new Map(saved === undefined ? [] : [[preference, JSON.stringify({ analytics: saved })]]);
  const listeners = {};
  const tags = [];
  const buttons = ['accept', 'reject'].map(choice => ({
    dataset: { cookieChoice: choice },
    addEventListener(_name, fn) { this.click = fn; },
  }));
  let banner;
  const document = {
    readyState: 'complete',
    title: 'LAqP',
    referrer: 'https://www.google.com/search?q=private',
    addEventListener(name, fn) { listeners[name] = fn; },
    createElement() { return { setAttribute() {}, querySelectorAll() { return buttons; }, remove() { banner = null; } }; },
    body: { append(node) { banner = node; } },
    head: { append(node) { tags.push(node); } },
    querySelector(selector) { if (selector === '.cookie-consent') return banner; },
  };
  const window = { addEventListener(name, fn) { listeners[name] = fn; } };
  const ctx = { location, document, window, URL, URLSearchParams, localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } };
  vm.runInNewContext(source, ctx);
  return { window, location, tags, listeners, storage, buttons, rerun: () => vm.runInNewContext(source, ctx),
    events: () => Array.from(window.dataLayer || [], command => [...command]).filter(command => command[0] === 'event') };
}

test('GA4 waits for opt-in, configures once, and records one initial view with a clean URL', () => {
  const app = setup('https://laqp.website/database.html?view=search&q=private&utm_source=community');
  assert.equal(app.tags.length, 0);
  app.buttons[0].click();
  app.rerun();
  app.window.LAQPAnalytics.pageView();
  assert.equal(app.tags.length, 1);
  assert.match(app.tags[0].src, /id=G-M7ZNDRZB27$/);
  const commands = Array.from(app.window.dataLayer, command => [...command]);
  assert.deepEqual(commands.slice(0, 4).map(command => command[0]), ['consent', 'consent', 'js', 'config']);
  assert.equal(commands[0][2].analytics_storage, 'denied');
  assert.equal(commands[1][2].analytics_storage, 'granted');
  assert.equal(commands[1][2].ad_storage, 'denied');
  assert.equal(commands[3][2].send_page_view, false);
  assert.equal(app.events().length, 1);
  assert.equal(app.events()[0][2].page_location, 'https://laqp.website/database.html?view=search&utm_source=community');
  assert.equal(app.events()[0][2].page_referrer, 'https://www.google.com');
});

test('virtual views deduplicate pagination and count back navigation', () => {
  const app = setup('https://laqp.website/database.html', true);
  app.location.pathname = '/database/teams/';
  app.window.LAQPAnalytics.pageView();
  app.location.search = '?offset=60&f_name=private';
  app.window.LAQPAnalytics.pageView();
  app.location.pathname = '/database.html';
  app.listeners.popstate();
  assert.deepEqual(app.events().map(command => command[2].page_location), [
    'https://laqp.website/database.html', 'https://laqp.website/database/teams/', 'https://laqp.website/database.html',
  ]);
});

test('rejecting, revoking in another tab, and running locally do not emit events', () => {
  for (const [url, saved] of [['https://laqp.website/', false], ['http://127.0.0.1:8080/', true]]) {
    const app = setup(url, saved);
    app.window.LAQPAnalytics.event('test', {});
    assert.equal(app.tags.length, 0);
    assert.equal(app.events().length, 0);
  }
  const app = setup('https://laqp.website/', true);
  app.storage.set(preference, '{"analytics":false}');
  app.listeners.storage({ key: preference });
  app.window.LAQPAnalytics.event('test', {});
  assert.equal(app.window['ga-disable-G-M7ZNDRZB27'], true);
  assert.equal(app.events().length, 1);
});

test('external downloads, ordinary outbound links and donation links have distinct events', () => {
  const app = setup('https://laqp.website/', true);
  for (const [href, donation] of [['https://sharemods.com/id/patch.rar.html', false], ['https://example.com/private?token=x', false], ['https://paypal.me/LAqP2018', true]]) {
    const anchor = { href, closest: selector => selector === '.download-donation' && donation };
    app.listeners.click({ button: 0, isTrusted: true, target: { closest: () => anchor } });
  }
  assert.deepEqual(app.events().map(command => command[1]), ['page_view', 'external_download_click', 'outbound_link_click']);
  assert.equal(app.events()[1][2].file_name, 'patch.rar');
  assert.equal(app.events()[2][2].link_domain, 'example.com');
  assert.equal(app.events()[2][2].link_url, undefined);
});
