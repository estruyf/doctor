/// <reference types="cypress" />
/// <reference types="../../support" />

describe('Microsoft Teams', function() {
  const PAGE_URL = "sitepages/home.aspx";

  /**
   * Before visiting SharePoint, we first need to authenticate
   */
  before(() =>  {
    cy.viewport(1200, 1000);
    cy.visitSP(PAGE_URL);
  });

  it('1. Check if the icon shortcode is rendered correctly', () => {
    cy.get(`[data-viewport-id*="MarkdownWebPart"] p#logo img`).should('exist');
  });

});