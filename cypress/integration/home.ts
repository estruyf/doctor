/// <reference types="cypress" />
/// <reference types="../support" />

describe('General tests for homepage', function() {
  const PAGE_URL = "sitepages/home.aspx";

  /**
   * Before visiting SharePoint, we first need to authenticate
   */
  before(() =>  {
    cy.visitSP(PAGE_URL);
  });

  after(() => {
    cy.screenshot();
  });
  
  it('1. Check if the topic header of the page contains "Doctor"', () => {
    cy.get(`[data-automation-id="topicHeaderText"]`).should(`exist`).contains('Doctor');
  });

  it('2. Check if the color of the header is changed to red', () => {
    cy.get(`[data-automationid="SiteHeader"]`).parents('div[class*=root]').should('exist').should('have.css', 'background-color', 'rgb(251, 244, 244)');  
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
      .should('contain.text', 'Test pages');
  });

  it('6. Check if doctor nav item contains the right children', () => {
    cy.contains(`[data-automationid="HorizontalNav-link"]`, 'Doctor')
      .should('exist')
      .trigger('mouseover');
    
    cy.get('.ms-Menu-section')
      .should('exist')
      .should('contain.text', 'Options')
      .should('contain.text', 'Installation')
      .should('contain.text', 'Page creation')
      .should('contain.text', 'Commands');
  });

});