/// <reference types="cypress" />
/// <reference types="../../support" />

describe('Page template usage validation', function() {
  const PAGE_URL = "sitepages/doctor/options.aspx";

  /**
   * Before visiting SharePoint, we first need to authenticate
   */
  before(() =>  {
    cy.visitSP(PAGE_URL);
  });

  after(() => {
    cy.screenshot();
  });

  it('1. Check if the code snippet background is using the right background', () => {
    cy.get(`h2#page-template-content`).should('exist').parent().should("contain.text", "This is some content to test out the page template.");
  });
});