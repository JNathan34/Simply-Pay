const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const origin = 'http://127.0.0.1:8799';
const key = 'plexpoint_manager_session';
const oldSession = 'a'.repeat(64);
const newSession = 'b'.repeat(64);
const root = path.resolve(__dirname, '..');

async function setup(browser, { status = 200, storageState } = {}) {
  const context = await browser.newContext({ storageState, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      const filename = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
      if (!fs.existsSync(filename)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ path: filename, contentType: filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.html') ? 'text/html' : undefined });
    }
    if (url.href === 'https://plexpoint.uk/api/portal/admin/users') return route.fulfill({ status, json: status === 200 ? { users: [] } : { message: 'Test session response' } });
    return route.fulfill({ status: 200, body: '', contentType: 'text/javascript' });
  });
  return context;
}

// Run with: node --test tests/plex-session.cjs (Playwright must be installed).
test('Plex sign-in survives a callback, reload and browser restart; failures only clear invalid sessions', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    let context = await setup(browser);
    await context.addInitScript(({ key, oldSession }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, oldSession);
      localStorage.setItem('simplyPay.activeProduct', 'plexpoint');
    }, { key, oldSession });
    let page = await context.newPage();
    const requests = [];
    page.on('request', r => { if (r.url().endsWith('/api/portal/admin/users')) requests.push(r.headers()['x-plexpoint-manager-session']); });
    await page.goto(`${origin}/#manager_session=${newSession}`);
    await page.locator('#plexLiveContent:not(.hidden)').waitFor();
    assert.deepEqual(requests, [newSession], 'first load must only send the newly returned session');
    assert.equal(await page.evaluate(k => localStorage.getItem(k), key), newSession);
    assert.equal(new URL(page.url()).hash, '');
    await page.reload();
    await page.locator('#plexLiveContent:not(.hidden)').waitFor();
    assert.deepEqual(requests, [newSession, newSession]);
    const saved = await context.storageState();
    await context.close();
    for (const status of [200, 403, 500, 401]) {
      context = await setup(browser, { status, storageState: saved });
      page = await context.newPage();
      await page.goto(origin);
      if(status === 200) await page.locator('#plexLiveContent:not(.hidden)').waitFor();
      else if(status === 500) await page.locator('#plexpointNotice.error').waitFor();
      else await page.locator('#plexSigninPanel:not(.hidden)').waitFor();
      await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(k => localStorage.getItem(k), key), status === 401 ? null : newSession, `status ${status}`);
      await context.close();
    }
  } finally { await browser.close(); }
});
