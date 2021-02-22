/// <reference types="cypress" />
/// <reference types="../../support" />

describe('home.aspx tests', function() {
  const PAGE_URL = "sitepages/home.aspx";

  /**
   * Before visiting SharePoint, we first need to authenticate
   */
  before(() =>  {
    cy.viewport(1200, 1000);
    cy.visitSP(PAGE_URL);
  });
  
  it('1. Check if the topic header of the page contains "Doctor"', () => {
    cy.screenshot();
    cy.get(`[data-automation-id="topicHeaderText"]`).should(`exist`).contains('Doctor');
  });

  it('2. Check if the color of the header is changed to red', () => {
    cy.get(`[data-automationid="SiteHeader"]`).parents('div[class*=root]').should('exist').should('have.css', 'background-color', 'rgb(164, 38, 44)');  
  });

  it('3. Check if the Markdown web part contains the doctor image', () => {
    cy.get(`[data-viewport-id*="MarkdownWebPart"] p#logo img`).should('exist');
  });

  it('4. Has a heading with the right description', () => {
    cy.get(`[data-viewport-id*="MarkdownWebPart"] h2`).should('exist').contains('Maintain your documenation on SharePoint without pain');
  });

  it('5. Check if the navigation contains the right links', () => {
    cy.get(`[data-automationid="HorizontalNav-link"]`)
      .should('exist')
      .should('contain.text', 'Doctor')
      .should('contain.text', 'tests');
  });

});