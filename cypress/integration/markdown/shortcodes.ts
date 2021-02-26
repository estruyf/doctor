/// <reference types="cypress" />
/// <reference types="../../support" />

describe('Doctor shortcodes', function() {
  const PAGE_URL = "sitepages/tests/shortcodes.aspx";

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
    cy.get(`pre.hljs`).first().should('exist').should('have.css', 'background-color', 'rgb(248, 248, 248)');
  });

  it('2. Check if the page contains icons', () => {
    cy.get(`[data-icon-name*="settings"]`).should('exist').should("have.length", 4);
  });

  it('3. Check if callout note exists', () => {
    cy.get(`.callout-note`)
      .should('exist')
      .should("have.length", 2)
      .last()
      .should('have.css', 'background-color', 'rgb(225, 223, 221)');
  });

  it('3. Check if callout tip exists', () => {
    cy.get(`.callout-tip`)
      .should('exist')
      .should("have.length", 2)
      .first()
      .should('have.css', 'background-color', 'rgb(186, 216, 10)');

    cy.get(`.callout-tip h5`)
      .last()
      .should('contain.text', 'OVERRIDE THE TITLE');
  });

  it('4. Check if callout info exists', () => {
    cy.get(`.callout-info`)
      .should('exist')
      .should("have.length", 1)
      .should('have.css', 'background-color', 'rgb(0, 183, 195)');
  });

  it('5. Check if callout caution exists', () => {
    cy.get(`.callout-caution`)
      .should('exist')
      .should("have.length", 1)
      .should('have.css', 'background-color', 'rgb(255, 170, 68)');
  });

  it('6. Check if callout danger exists', () => {
    cy.get(`.callout-danger`)
      .should('exist')
      .should("have.length", 1)
      .should('have.css', 'background-color', 'rgb(209, 52, 56)');
  });

  it('7. check if custom shortcode is created correctly', () => {
    cy.get(`.custom-shortcode`)
      .should('exist')
      .should("have.length", 1)
      .should('contain.text', 'Name: Elio')
      .should('contain.text', 'HTML: Content of the external shortcode');
  });

});