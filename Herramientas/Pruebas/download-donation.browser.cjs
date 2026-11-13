'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

const root = path.resolve(__dirname, '../..');
const base = 'https://laqp.test';
const key = 'laqp_download_donation_shown_at';
const days30 = 30 * 86400000;
const notice = '.download-donation';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png' };
const fixture = `
  <link rel="stylesheet" href="/css/download-donation.css">
  <button id="export">Exportar</button><button id="other">Otra acción</button>
  <script type="module">
    import { clickDownload } from '/js/download-donation.js?v=20261113-ga4';
    window.events = [];
    window.LAQPAnalytics = {
      event: (...args) => {
        if (JSON.parse(localStorage.getItem('laqp_cookie_consent_v1'))?.analytics) window.events.push(args);
      },
      download: tool => window.LAQPAnalytics.event('tool_download_start', { tool, file_extension: 'txt' }),
    };
    document.querySelector('#export').onclick = () => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob(['LAqP']));
      link.download = 'test.txt';
      link.addEventListener('click', event => {
        window.shownDuringClick = !!document.querySelector('.download-donation');
        if (window.cancelDownload) event.preventDefault();
      });
      clickDownload(link, 'fixture');
    };
  </script>`;

async function run() {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const googleRequests = [];
    await context.addInitScript(() => {
      const createObjectURL = URL.createObjectURL;
      URL.createObjectURL = function (blob) {
        const url = createObjectURL.call(this, blob);
        if (blob instanceof Blob) window.lastGeneratedFile = blob;
        return url;
      };
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'www.googletagmanager.com') {
        googleRequests.push(url.href);
        return route.fulfill({ contentType: 'text/javascript', body: '' });
      }
      if (![base, 'https://laqp.website'].includes(url.origin)) return route.fulfill({ status: 200, body: '' });
      if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: fixture });
      const file = path.join(root, decodeURIComponent(url.pathname));
      const body = await fs.readFile(file).catch(() => null);
      return route.fulfill(body ? { body, contentType: mime[path.extname(file)] || 'application/octet-stream' } : { status: 204 });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/fixture');
    await page.waitForFunction(() => Array.isArray(window.events));
    const exportButton = page.locator('#export');
    const toast = page.getByRole('region', { name: /Te sirvió esta herramienta/ });
    const downloadFrom = async button => {
      const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
      return download;
    };
    await page.evaluate(() => { window.cancelDownload = true; });
    await exportButton.click();
    assert.equal(await toast.count(), 0);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
    await page.evaluate(() => {
      window.cancelDownload = false;
      localStorage.setItem('laqp_cookie_consent_v1', '{"analytics":true}');
    });
    const download = await downloadFrom(exportButton);
    assert.equal(download.suggestedFilename(), 'test.txt');
    assert.equal(await page.evaluate(() => window.lastGeneratedFile.text()), 'LAqP');
    await toast.waitFor();
    assert.equal(await page.evaluate(() => window.shownDuringClick), false);
    assert.equal(await exportButton.evaluate(el => el === document.activeElement), true);
    for (const [name, href] of [['Mercado Pago', 'https://link.mercadopago.com.ar/laqp'], ['PayPal', 'https://paypal.me/LAqP2018']]) {
      const link = toast.getByRole('link', { name: new RegExp(name) });
      assert.equal(await link.getAttribute('href'), href);
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
      const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
      await popup.close();
    }
    assert.deepEqual(await page.evaluate(() => window.events), [
      ['tool_download_start', { tool: 'fixture', file_extension: 'txt' }],
      ['donation_invite_shown', { tool: 'fixture' }],
      ['donation_invite_click', { tool: 'fixture', donation_provider: 'mercado_pago' }],
      ['donation_invite_click', { tool: 'fixture', donation_provider: 'paypal' }],
    ]);
    await toast.getByRole('button', { name: /Cerrar/ }).focus();
    await page.keyboard.press('Escape');
    assert.equal(await toast.count(), 0);
    assert.equal(await exportButton.evaluate(el => el === document.activeElement), true);
    await page.locator('#other').click();
    console.log('Orden de activación, foco, cierre y eventos de analítica OK.');

    await page.goto(base + '/tier-list.html#tier-list');
    const previousShownAt = await page.evaluate(key => {
      const previous = localStorage.getItem(key);
      localStorage.removeItem(key);
      return previous;
    }, key);
    await page.locator('.lr-menu summary').click();
    const backup = await downloadFrom(page.locator('#backup'));
    assert.equal(backup.suggestedFilename(), 'laqp-tier-list.json');
    assert.equal(await page.locator(notice).count(), 0);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
    assert.equal(await page.locator('script[src*="download-donation"], link[href*="download-donation"]').count(), 0);
    await page.evaluate(({ key, previousShownAt }) => localStorage.setItem(key, previousShownAt), { key, previousShownAt });
    console.log('Copia JSON de Tier List fuera de la invitación OK.');

    await page.goto(base + '/kit-color-studio.html');
    await page.waitForFunction(() => window.kcs?.state.project);
    await page.locator('#kcs-file').setInputFiles(path.join(__dirname, 'fixtures/kit-color-studio/kit-suelto.png'));
    await page.waitForFunction(() => {
      const state = window.kcs?.state;
      return state?.project && !state.busy && Object.values(state.project.nodes).some(node => node.status === 'ready');
    });
    const kit = await downloadFrom(page.locator('.kcs-topbar [data-action="export-project"]'));
    assert.match(kit.suggestedFilename(), /\.laqpkits$/);
    assert.equal(await page.locator(notice).count(), 0);

    await page.goto(base + '/soundtrack-maker.html');
    const project = await page.evaluate(async () => {
      const { saveProject } = await import('/js/soundtrack-maker/project.js');
      const file = new File(['audio de prueba'], 'pista.mp3', { type: 'audio/mpeg' });
      const blob = saveProject({ songs: [{ file, name: file.name, title: 'Pista', duration: 3 }] });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    await page.locator('#sm-project-file').setInputFiles({
      name: 'prueba.laqpst', mimeType: 'application/octet-stream', buffer: Buffer.from(project),
    });
    const soundtrack = await downloadFrom(page.locator('#sm-project-save'));
    assert.match(soundtrack.suggestedFilename(), /\.laqpst$/);
    assert.equal(await page.evaluate(() => window.lastGeneratedFile.slice(0, 8).text()), 'LAQPST01');
    assert.equal(await page.locator(notice).count(), 0);

    await page.goto(base + '/miniface-studio.html');
    await page.locator('[data-mode="personal"]').click();
    await page.locator('#ms-file').setInputFiles(path.join(root, 'img/logo.webp'));
    await page.evaluate(({ key, days30 }) => {
      localStorage.setItem(key, String(Date.now() - days30));
      localStorage.setItem('laqp_cookie_consent_v1', '{"analytics":false}');
      window.donationEvents = [];
      window.gtag = (...args) => window.donationEvents.push(args);
    }, { key, days30 });
    await page.setViewportSize({ width: 320, height: 568 });
    const miniface = await downloadFrom(page.locator('[data-action="export-image"]'));
    assert.match(miniface.suggestedFilename(), /\.png$/);
    assert.deepEqual(await page.evaluate(async () => Array.from(new Uint8Array(await window.lastGeneratedFile.slice(0, 8).arrayBuffer()))),
      [137, 80, 78, 71, 13, 10, 26, 10]);
    await toast.waitFor();
    const box = await toast.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.y >= 0 && box.y + box.height <= 568);
    assert.deepEqual(await page.evaluate(() => window.donationEvents), []);
    await toast.getByRole('button', { name: /Cerrar/ }).click();
    assert.equal(await toast.count(), 0);

    await page.goto(base + '/fixture');
    await page.evaluate(key => {
      localStorage.removeItem(key);
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key) throw new Error('Almacenamiento no disponible');
        return setItem.call(this, name, value);
      };
    }, key);
    await downloadFrom(exportButton);
    await downloadFrom(exportButton);
    await page.evaluate(async key => {
      await new Promise(resolve => setTimeout(resolve, 0));
      await navigator.locks.request(key, () => {});
    }, key);
    assert.equal(await toast.count(), 0);
    assert.deepEqual(errors, []);

    const database = await context.newPage();
    await database.clock.install();
    await database.addInitScript(() => {
      localStorage.setItem('laqp_database_donation_active_ms', String(20 * 60_000 - 20_000));
    });
    await database.goto(base + '/database.html');
    await database.bringToFront();
    await database.waitForFunction(() => document.hasFocus());
    const databaseToast = database.getByRole('region', { name: /Te sirve la base de datos/ });
    await database.clock.runFor(30_000);
    assert.equal(await databaseToast.count(), 0);
    await database.keyboard.press('Shift');
    await database.clock.runFor(32_000);
    await databaseToast.waitFor();
    await databaseToast.getByRole('button', { name: /Cerrar/ }).click();
    await database.reload();
    await database.keyboard.press('Shift');
    await database.clock.runFor(32_000);
    assert.equal(await databaseToast.count(), 0);
    assert.ok(await database.evaluate(() => localStorage.getItem('laqp_database_donation_shown_at')));
    assert.deepEqual(googleRequests, []);

    const production = await context.newPage();
    await production.goto('https://laqp.website/cookies.html');
    const banner = production.getByRole('region', { name: 'Preferencias de analítica' });
    await banner.getByRole('button', { name: 'Rechazar' }).click();
    assert.deepEqual(googleRequests, []);
    await production.getByRole('button', { name: 'Cambiar preferencias de analítica' }).click();
    await banner.getByRole('button', { name: 'Aceptar' }).click();
    await production.waitForFunction(() => Array.from(window.dataLayer || []).some(args => args[1] === 'page_view'));
    assert.equal(googleRequests.length, 1);
    await production.getByRole('button', { name: 'Cambiar preferencias de analítica' }).click();
    await banner.getByRole('button', { name: 'Rechazar' }).click();
    assert.equal(await production.evaluate(() => window['ga-disable-G-M7ZNDRZB27']), true);
    console.log('Invitación, consentimiento, límite entre herramientas, cierre, móvil y descargas reales OK.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
