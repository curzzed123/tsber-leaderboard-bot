const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const HTML_PATH = 'file:///C:/Users/ziyad/.codely/Default/necklace-animation/index.html';
const FRAME_DIR = 'C:\\Users\\ziyad\\.codely\\Default\\necklace-animation\\frames';
const DURATION = 12000;
const TARGET_FPS = 30;

async function main() {
  fs.mkdirSync(FRAME_DIR, { recursive: true });
  for (const f of fs.readdirSync(FRAME_DIR)) fs.unlinkSync(path.join(FRAME_DIR, f));

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--window-size=1920,1080', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  // Hide replay button
  await page.evaluateOnNewDocument(() => {
    const style = document.createElement('style');
    style.textContent = '.replay-btn { display: none !important; }';
    document.head.appendChild(style);
  });

  await page.goto(HTML_PATH, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  // Replay animation to start fresh
  await page.evaluate(() => {
    const el = document.getElementById('necklace');
    const glow = document.getElementById('glow');
    const wings = el.querySelectorAll('.wing-left, .wing-right');
    [el, glow, ...wings].forEach(node => {
      node.style.animation = 'none';
      void node.offsetWidth;
      node.style.animation = '';
    });
  });

  const startTime = Date.now();
  let frameNum = 0;
  const targetFrameTime = 1000 / TARGET_FPS;

  while (Date.now() - startTime < DURATION) {
    const expectedTime = frameNum * targetFrameTime;
    const now = Date.now() - startTime;
    if (now < expectedTime) {
      await new Promise(r => setTimeout(r, expectedTime - now));
    }

    const framePath = path.join(FRAME_DIR, `frame_${String(frameNum).padStart(5, '0')}.jpg`);
    await page.screenshot({ path: framePath, type: 'jpeg', quality: 95 });
    frameNum++;

    if (frameNum % 30 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`Frame ${frameNum} (${elapsed.toFixed(1)}s)`);
    }
  }

  await browser.close();
  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`Done! ${frameNum} frames in ${totalTime}s (${(frameNum / totalTime).toFixed(1)}fps)`);
}

main().catch(console.error);
