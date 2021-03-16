/// <reference types="cypress" />
/// <reference types="../support" />

describe('Comments testing', function() {
  const PAGE_URL = "sitepages/doctor/documentation.aspx";

  /**
   * Before visiting SharePoint, we first need to authenticate
   */
  before(() =>  {
    cy.visitSP(PAGE_URL);
  });

  after(() => {
    cy.screenshot();
  });

  it('1. Check if page comments are disabled', () => {
    cy.get(`#sp-comments`).should('not.exist');
  });

});