/// <reference types="cypress" />
/// <reference types="../support" />

describe('Doctor table of contents', function() {
  const PAGE_URL = "sitepages/doctor/page-creation.aspx";

  /**
   * Before visiting SharePoint, we first need to authenticate
   */
  before(() =>  {
    cy.visitSP(PAGE_URL);
  });

  after(() => {
    cy.screenshot();
  });

  it('1. Check if the table of contents exists', () => {
    cy.get(`.table-of-contents`).should('exist');
  });

  it('2. Check if it contains three root elements', () => {
    cy.get(`.table-of-contents > li`).should('exist').should("have.length", 3);
  });

  it('3. Check if it contains two sub-lists', () => {
    cy.get(`.table-of-contents > ul`).should('exist').should("have.length", 2);
  });

  it('4. Check if total number of links are correct', () => {
    cy.get(`.table-of-contents li`).should('exist').should("have.length", 7);
  });

  it('5. Check if headings have an anchor tag', () => {
    cy.get(`h3#menu a.toc-anchor`).should('exist');
  });

});