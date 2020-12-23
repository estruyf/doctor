const { chromium } = require('playwright-chromium');
const spauth = require('node-sp-auth');
const fs = require('fs');
const path = require('path');

const testSite = async (page, siteUrl, type) => {
  await page.setViewportSize({
    height: 2500,
    width: 1200
  });

  await page.goto(siteUrl, {
    waitUntil: "networkidle0"
  });

  fs.mkdirSync(path.join(__dirname, `../screenshots`), { recursive: true });

  await page.screenshot({ path: path.join(__dirname, `../screenshots/${type}.png`) });
}

(async () => {
  try {

    const { USER_NAME, PASSWORD, SITEURL_WINDOWS_POWERSHELL, SITEURL_WINDOWS, SITEURL_LINUX, SITEURL_MACOS } = process.env;

    console.log('');
    console.log(USER);

    const browser = await chromium.launch();

    const authData = await spauth.getAuth(SITEURL_MACOS, {
      username: USER_NAME,
      password: PASSWORD,
      online: true
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders(authData.headers);

    await testSite(page, SITEURL_MACOS, 'macos');
    await testSite(page, SITEURL_LINUX, 'linux');
    await testSite(page, SITEURL_WINDOWS_POWERSHELL, 'windows_powershell');
    await testSite(page, SITEURL_WINDOWS, 'windows');

    await browser.close();

  } catch (err) {
    console.log(err);
    return;
  }
})();