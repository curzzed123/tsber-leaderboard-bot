const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const HTML_PATH = 'file:///C:/Users/ziyad/.codely/Default/necklace-animation/index.html';
const FRAME_DIR = 'C:\\Users\\ziyad\\.codely\\Default\\necklace-animation\\frames';
const DURATION = 130000; // 130s real time = 13s animation time at 0.1x speed
const SLOWDOWN = 10;

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

  // Hide replay button + slow down all animations
  await page.evaluateOnNewDocument(() => {
    const style = document.createElement('style');
    style.textContent = '.replay-btn { display: none !important; }';
    document.head.appendChild(style);
  });

  await page.goto(HTML_PATH, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  // Slow down all animations by factor of SLOWDOWN
  await page.evaluate((slow) => {
    // Slow CSS animations
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.type === 7) { // CSSKeyframesRule
            // nothing needed here
          }
        }
      } catch(e) {}
    }
    // Use playbackRate on the document timeline
    document.timeline.playbackRate = 1 / slow;

    // Also restart animations
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
  const targetFrameTime = 1000 / 30; // aim for 30fps capture

  while (Date.now() - startTime < DURATION) {
    const expectedTime = frameNum * targetFrameTime;
    const now = Date.now() - startTime;
    if (now < expectedTime) {
      await new Promise(r => setTimeout(r, expectedTime - now));
    }

    const framePath = path.join(FRAME_DIR, `frame_${String(frameNum).padStart(5, '0')}.png`);
    await page.screenshot({ path: framePath, type: 'png' });
    frameNum++;

    if (frameNum % 60 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`Frame ${frameNum} (${elapsed.toFixed(1)}s)`);
    }
  }

  await browser.close();
  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`Done! ${frameNum} frames in ${totalTime}s`);
  console.log(`Effective capture fps: ${(frameNum / totalTime).toFixed(1)}`);
  console.log(`Animation time covered: ${(totalTime / SLOWDOWN).toFixed(1)}s`);
  console.log(`Output fps will be: ${(frameNum / totalTime * SLOWDOWN).toFixed(1)}`);
}

main().catch(console.error);
