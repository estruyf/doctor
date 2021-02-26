
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
    username: process.env.USERNAME || Cypress.env('USERNAME'),
    password: process.env.PASSWORD || Cypress.env('PASSWORD'),
    siteUrl: process.env.SITEURL || Cypress.env('SITEURL'),
  };
}

/**
 * Retrieve the 
 */
Cypress.Commands.add("visitSP", (pageUrl: string | null) => {
  const config = getConfig();
  cy.task('NodeAuth', config).then((data: any) => {
    cy.visit(`${config.siteUrl}/${pageUrl}`, {
      headers: data.headers,
      onBeforeLoad: (win) => {
        (win as any)["parent"] = win;
      }
    });
  });
});