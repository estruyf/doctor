/// <reference types="cypress" />
/// <reference types="../support" />

describe('Multilingual validation', function() {
  const PAGE_URL = "sitepages/doctor/nl/page-creation.aspx";

  /**
   * Before visiting SharePoint, we first need to authenticate
   */
  before(() =>  {
    cy.visitSP(PAGE_URL);
  });

  after(() => {
    cy.screenshot();
  });

  it('1. Check if language selector is available on the page', () => {
    cy.get(`[data-automation-id="LanguageSelector"]`).should('exist').should("contain.text", "Dutch");
  });

  it('2. Check if the page contains the right language contents', () => {
    cy.get(`h2#page-creation`).should('exist');
  });
});