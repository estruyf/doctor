/// <reference types="cypress" />
/// <reference types="../support" />

describe('General tests for homepage', function() {
  const PAGE_URL = "sitepages/tests/codeblocks.aspx";

  /**
   * Before visiting SharePoint, we first need to authenticate
   */
  before(() =>  {
    cy.visitSP(PAGE_URL);
  });

  after(() => {
    cy.screenshot();
  });
  
  it('1. Verify the JavaScript codeblock for double quotes', () => {
    cy.get(`pre.javascript`).should(`exist`).contains(`console.log("Hello from Doctor");`);
  });
  
  it('2. Verify the TypeScript codeblock for single quotes', () => {
    cy.get(`pre.typescript`).should(`exist`).contains(`console.log('Hello back Doctor');`);
  });
  
  it('3. Verify the TypeScript codeblock for single quotes', () => {
    cy.get(`pre.csharp`).should(`exist`).contains(`console.log($"I'm always {true}");`);
  });

});