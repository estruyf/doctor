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
    cy.get(`.table-of-contents > ul > li`).should('exist').should("have.length", 2);
  });

  it('3. Check if it contains two sub-lists', () => {
    cy.get(`.table-of-contents > ul ul`).should('exist').should("have.length", 2);
  });

  it('4. Check if total number of links are correct', () => {
    cy.get(`.table-of-contents li`).should('exist').should("have.length", 6);
  });

  it('5. Check if headings have an anchor tag', () => {
    cy.get(`h3#menu a.toc-anchor`).should('exist');
  });

  it('6. Check if toc is positioned at the right side', () => {
    cy.get(`.doctor__container__toc`).should('exist').should('have.class', 'doctor__container__toc_right');
  });

  it('7. Check if toc is positioned sticky', () => {
    cy.get(`.doctor__container__toc`).should('exist').should('have.css', 'position', 'sticky');
  });

});