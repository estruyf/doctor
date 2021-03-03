/// <reference types="cypress" />
/// <reference types="../support" />

describe('Special character tests', function() {
  const PAGE_URL = "sitepages/tests/characters.aspx";

  /**
   * Before visiting SharePoint, we first need to authenticate
   */
  before(() =>  {
    cy.visitSP(PAGE_URL);
  });

  after(() => {
    cy.screenshot();
  });

  it('1. Check markdown web part exists', () => {
    cy.get(`[data-viewport-id*="MarkdownWebPart"]`).should('exist');
  });

  it('2. Verify if backslash is correctly added', () => {
    cy.get(`[data-viewport-id*="MarkdownWebPart"]`).should("contain.text", "domain\\sp");
  });

  it('3. Verify if asterisks are correctly added', () => {
    cy.get(`[data-viewport-id*="MarkdownWebPart"]`).should("contain.text", "* */15 * * * *");
  });

  it('4. Verify if square brackets are correctly added', () => {
    cy.get(`[data-viewport-id*="MarkdownWebPart"]`).should('contain.text', '[array]');
  });
});