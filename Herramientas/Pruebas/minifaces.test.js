'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../js/minifaces.js'), 'utf8');

function setup(savedMode, storageUnavailable = false) {
  class Image {
    constructor(original = 'img/pes_original_minifaces/123.webp', legacy = false) {
      this.dataset = legacy ? {} : { playerId: '123', minifaceCurrentSrc: 'img/players/123.webp', minifacePesSrc: original };
      this.attrs = legacy ? { src: 'img/players/123.webp' } : {};
      this.requests = [];
      this.complete = false;
      this.naturalWidth = 0;
    }
    getAttribute(key) { return this.attrs[key] || null; }
    setAttribute(key, value) { this.attrs[key] = value; if (key === 'src') this.requests.push(value); }
  }
  let stored = savedMode;
  const handlers = {};
  const document = {
    documentElement: {},
    addEventListener: (type, handler) => { handlers[type] = handler; },
    querySelectorAll: () => [], dispatchEvent: () => {},
  };
  const context = {
    document, window: {}, HTMLImageElement: Image,
    MutationObserver: class { observe() {} },
    CustomEvent: class {}, Node: { ELEMENT_NODE: 1 },
    localStorage: {
      getItem() { if (storageUnavailable) throw Error('denied'); return stored; },
      setItem(key, value) { if (storageUnavailable) throw Error('denied'); stored = value; },
    },
  };
  vm.runInNewContext(source, context);
  return { Image, api:context.window.LAQPMinifaces, error:image=>handlers.error({target:image,preventDefault(){},stopImmediatePropagation(){}}), stored:()=>stored };
}

test('saved PES mode loads only the original initially, then falls back to default', () => {
  const env = setup('pes2018');
  const image = new env.Image();
  env.api.refresh(image);
  assert.deepEqual(image.requests, ['img/pes_original_minifaces/123.webp']);
  env.error(image);
  assert.deepEqual(image.requests, ['img/pes_original_minifaces/123.webp', 'img/players/default.webp']);
  env.error(image);
  assert.deepEqual(image.requests, ['img/pes_original_minifaces/123.webp', 'img/players/default.webp']);
});

test('known missing original uses default, then current mode uses modern face', () => {
  const env = setup('pes2018');
  const image = new env.Image('');
  env.api.refresh(image);
  assert.deepEqual(image.requests, ['img/players/default.webp']);
  env.api.setMode('current');
  env.api.refresh(image);
  assert.deepEqual(image.requests, ['img/players/default.webp', 'img/players/123.webp']);
});

test('current mode and repeated refresh do not request the other mode', () => {
  const env = setup('current');
  const image = new env.Image();
  env.api.refresh(image);
  env.api.refresh(image);
  assert.deepEqual(image.requests, ['img/players/123.webp']);
  env.api.setMode('pes2018');
  assert.equal(env.stored(), 'pes2018');
  env.api.refresh(image);
  assert.equal(image.requests.at(-1), 'img/pes_original_minifaces/123.webp');
});

test('legacy database markup remains supported', () => {
  const env = setup('pes2018');
  const image = new env.Image(undefined, true);
  env.api.refresh(image);
  assert.equal(image.dataset.playerId, '123');
  assert.equal(image.attrs.src, 'img/pes_original_minifaces/123.webp');
});

test('blocked localStorage does not break switching', () => {
  const env = setup(undefined, true);
  assert.equal(env.api.getMode(), 'current');
  env.api.setMode('pes2018');
  assert.equal(env.api.getMode(), 'pes2018');
});
