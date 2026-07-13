const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const HTML_PATH = 'file:///C:/Users/ziyad/.codely/Default/necklace-animation/index.html';
const FRAME_DIR = 'C:\\Users\\ziyad\\.codely\\Default\\necklace-animation\\frames2';
const SLOWDOWN = 15;

// We want ~30fps output, 12s animation = 360 frames
// At SLOWDOWN=15, that's 180s real time
// Need 360 frames in 180s = 2fps capture
const DURATION = 185000;

async function main() {
  fs.mkdirSync(FRAME_DIR, { recursive: true });
  for (const f of fs.readdirSync(FRAME_DIR)) fs.unlinkSync(path.join(FRAME_DIR, f));

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--window-size=1280,720', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

  await page.evaluateOnNewDocument(() => {
    const style = document.createElement('style');
    style.textContent = '.replay-btn { display: none !important; }';
    document.head.appendChild(style);
  });

  await page.goto(HTML_PATH, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  // Slow down animations
  await page.evaluate((slow) => {
    document.timeline.playbackRate = 1 / slow;
    const el = document.getElementById('necklace');
    const glow = document.getElementById('glow');
    const wings = el.querySelectorAll('.wing-left, .wing-right');
    [el, glow, ...wings].forEach(node => {
      node.style.animation = 'none';
      void node.offsetWidth;
      node.style.animation = '';
    });
  }, SLOWDOWN);

  await new Promise(r => setTimeout(r, 1000));

  const startTime = Date.now();
  let frameNum = 0;

  while (Date.now() - startTime < DURATION) {
    const targetTime = frameNum * (1000 / 2); // capture every 500ms
    const now = Date.now() - startTime;
    if (now < targetTime) {
      await new Promise(r => setTimeout(r, targetTime - now));
    }

    const framePath = path.join(FRAME_DIR, `f_${String(frameNum).padStart(5, '0')}.jpg`);
    await page.screenshot({ path: framePath, type: 'jpeg', quality: 90 });
    frameNum++;

    if (frameNum % 30 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`Frame ${frameNum} (${elapsed.toFixed(1)}s)`);
    }
  }

  await browser.close();
  const totalTime = (Date.now() - startTime) / 1000;
  const animTime = totalTime / SLOWDOWN;
  console.log(`Done! ${frameNum} frames in ${totalTime}s`);
  console.log(`Animation time: ${animTime.toFixed(1)}s`);
  console.log(`At 30fps output, need ${Math.round(animTime * 30)} frames - have ${frameNum}`);
  console.log(`Output fps = ${frameNum / animTime}`);
}

main().catch(console.error);
