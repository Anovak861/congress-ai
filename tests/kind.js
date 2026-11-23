const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  p.on('requestfailed', r => console.log('FAILED', r.url().slice(0,80)));
  p.on('response', r => { if (r.status() === 404) console.log('404', r.url()); });
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(400);
  await p.selectOption('#stateSel', 'MO'); await p.selectOption('#distSel', '7');
  for (const [k, l] of [['call','long'],['meeting','short'],['email','short']]) {
    await p.click(`label:has(input[value=${k}])`); await p.click(`label:has(input[value=${l}])`);
    console.log(`--- ${k}/${l}:`, await p.$eval(`input[value=${k}]`, e => e.checked));
    console.log((await p.inputValue('#out')).split('\n').slice(0, 5).join('\n'));
  }
  await b.close();
})();
