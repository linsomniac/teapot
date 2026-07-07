// Automated ?bench=1 run (Task 13.1, §12.6/§15.7): gesture-starts the bench
// and captures the console JSON report.
//   node scripts/bench.mjs <chromium|firefox> <baseUrl>
import { chromium, firefox } from 'playwright';

const [browserName, baseUrl] = process.argv.slice(2);
const engine = browserName === 'firefox' ? firefox : chromium;
const executablePath =
  browserName === 'firefox' ? process.env.FIREFOX_BIN : process.env.CHROME_BIN;

const browser = await engine.launch({
  headless: false,
  ...(executablePath ? { executablePath } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });

let report = null;
page.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('"bench"')) {
    try {
      report = JSON.parse(text).bench;
    } catch {
      /* keep waiting */
    }
  }
});

const extra = process.env.BENCH_EXTRA ?? '';
await page.goto(`${baseUrl}/?bench=1${extra}`);
await page.waitForTimeout(1500);
await page.mouse.click(720, 540); // gesture-start
const start = Date.now();
while (report === null && Date.now() - start < 90000) {
  await page.waitForTimeout(1000);
}
await browser.close();
if (report === null) {
  console.error('bench produced no report within 90 s');
  process.exit(1);
}
console.log(JSON.stringify({ browser: browserName, ...report }));
process.exit(0);
