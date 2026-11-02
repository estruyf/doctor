import { chromium } from "playwright-chromium";
import spauth from "node-sp-auth";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testSite = async (page, siteUrl, type) => {
  await page.setViewportSize({
    height: 2500,
    width: 1200,
  });

  await page.goto(siteUrl, {
    waitUntil: "networkidle0",
  });

  fs.mkdirSync(path.join(__dirname, `../screenshots`), { recursive: true });

  await page.screenshot({
    path: path.join(__dirname, `../screenshots/${type}.png`),
  });
};

(async () => {
  try {
    const { USER_NAME, PASSWORD, SITEURL_LINUX } = process.env;

    const browser = await chromium.launch();

    const authData = await spauth.getAuth(SITEURL_LINUX, {
      username: USER_NAME,
      password: PASSWORD,
      online: true,
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders(authData.headers);

    await testSite(page, SITEURL_LINUX, "linux");

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
})();
