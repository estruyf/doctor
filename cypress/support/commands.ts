
interface config {
  username: string;
  password: string;
  siteUrl: string;
}

/**
 * Return config
 */
function getConfig(): config {
  return {
    username: !process.env.CI ? Cypress.env('USERNAME') : process.env.USERNAME,
    password: !process.env.CI ? Cypress.env('PASSWORD') : process.env.PASSWORD,
    siteUrl: !process.env.CI ? Cypress.env('SITEURL') : process.env.SITEURL,
  };
}

/**
 * Retrieve the 
 */
Cypress.Commands.add("visitSP", (pageUrl: string | null) => {
  const config = getConfig();
  console.log(config)
  cy.task('NodeAuth', config).then((data: any) => {
    cy.visit(`${config.siteUrl}/${pageUrl}`, {
      headers: data.headers,
      onBeforeLoad: (win) => {
        (win as any)["parent"] = win;
      }
    });
  });
});