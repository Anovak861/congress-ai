const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8765/index.html');
  await p.waitForTimeout(500);
  // address lookup (no network here -> should fall back gracefully)
  await p.fill('#addr', '1600 Pennsylvania Ave, Springfield, MO 65801');
  await p.click('button[type=submit]');
  await p.waitForTimeout(1500);
  console.log('MSG:', await p.textContent('#findMsg'));
  await p.selectOption('#stateSel', 'MO');
  await p.selectOption('#distSel', '7');
  await p.waitForTimeout(300);
  console.log('CARDS:', await p.$$eval('.card .nm', els => els.map(e => e.textContent)));
  console.log('TIP:', await p.textContent('#tip'));
  console.log('POLICIES:', await p.$$eval('#polBox input', els => els.map(e => e.dataset.p + '=' + e.checked)));
  console.log('ANGLES checked:', await p.$$eval('#angBox input:checked', els => els.map(e => e.dataset.a).join(',')));
  await p.fill('#uName', 'Test Person'); await p.fill('#uCity', 'Springfield'); await p.fill('#uZip', '65801');
  await p.click('text=Call script'); await p.click('label:has(input[value=long])');
  await p.check('#polBox input[data-p=PAUSE]');
  const out = await p.inputValue('#out');
  console.log('OUT (call, long, first 6 lines):\n' + out.split('\n').slice(0, 9).join('\n'));
  // second card (House member)
  const cards = await p.$$('.card'); await cards[2].click(); await p.waitForTimeout(200);
  console.log('SELECTED:', await p.$eval('.card[aria-pressed=true] .nm', e => e.textContent));
  console.log('LOCAL box hidden?', await p.$eval('#localBox', e => e.classList.contains('hidden')));
  await p.screenshot({ path: '/tmp/desk.png', fullPage: false });
  await p.setViewportSize({ width: 390, height: 900 });
  await p.waitForTimeout(200);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log('Mobile horizontal overflow:', overflow);
  await p.screenshot({ path: '/tmp/mobile.png', fullPage: true });
  // senators for LA + runoff district
  await p.setViewportSize({ width: 1280, height: 1000 });
  await p.selectOption('#stateSel', 'LA'); await p.selectOption('#distSel', '5'); await p.waitForTimeout(200);
  console.log('LA-5 cards:', await p.$$eval('.card', els => els.map(e => e.querySelector('.nm').textContent + (e.disabled ? ' [disabled]' : ''))));
  console.log('ERRORS:', errs);
  await b.close();
})();
