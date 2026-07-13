const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const HTML_PATH = 'file:///C:/Users/ziyad/.codely/Default/necklace-animation/capture_page.html';
const FRAME_DIR = 'C:\\Users\\ziyad\\.codely\\Default\\necklace-animation\\frames3';
const ANIM_DURATION = 13; // seconds of animation to capture
const TARGET_FPS = 30;
const SLOWDOWN = 12; // slow CSS animations by this factor

async function main() {
  fs.mkdirSync(FRAME_DIR, { recursive: true });
  for (const f of fs.readdirSync(FRAME_DIR)) fs.unlinkSync(path.join(FRAME_DIR, f));

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--window-size=1280,720', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1']
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

  // Set playback rate and start animation
  await page.evaluate((slow) => {
    document.timeline.playbackRate = 1 / slow;
    document.body.classList.remove('paused');
  }, SLOWDOWN);

  // Capture frames using CDP for speed
  const client = await page.target().createCDPSession();

  const totalFrames = Math.ceil(ANIM_DURATION * TARGET_FPS);
  const realDuration = totalFrames * SLOWDOWN / TARGET_FPS; // seconds in real time
  console.log(`Capturing ${totalFrames} frames over ${realDuration.toFixed(1)}s real time (${ANIM_DURATION}s animation)`);

  const frameInterval = (1000 * SLOWDOWN / TARGET_FPS); // ms between frames in real time
  const startTime = Date.now();

  for (let i = 0; i < totalFrames; i++) {
    const targetTime = i * frameInterval;
    const now = Date.now() - startTime;
    if (now < targetTime) {
      await new Promise(r => setTimeout(r, targetTime - now));
    }

    // Use CDP Page.captureScreenshot - faster than page.screenshot
    const result = await client.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 95
    });

    const framePath = path.join(FRAME_DIR, `f_${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(framePath, Buffer.from(result.data, 'base64'));

    if (i % 30 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const fps = (i + 1) / elapsed;
      console.log(`Frame ${i+1}/${totalFrames} (${elapsed.toFixed(1)}s, ${fps.toFixed(1)}fps capture)`);
    }
  }

  await browser.close();
  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`\nDone! ${totalFrames} frames in ${totalTime.toFixed(1)}s`);
  console.log(`Real fps: ${(totalFrames / totalTime).toFixed(1)}`);
  console.log(`Animation covered: ${(totalFrames / TARGET_FPS).toFixed(1)}s at ${TARGET_FPS}fps output`);
}

main().catch(console.error);
