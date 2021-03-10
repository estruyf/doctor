/// <reference types="cypress" />
/// <reference types="../support" />

describe('Verify if all pages are still in place after the post clean-up', function() {
  const PAGE_URL = "sitepages/tests/characters.aspx";

  it('1. Verify homepage', () => {
    cy.visitSP('sitepages/home.aspx');
  });
  
  it('2. Verify template', () => {
    cy.visitSP('sitepages/Templates/PageTemplate.aspx');
  });
  
  it('3. Verify commands', () => {
    cy.visitSP('SitePages/doctor/commands.aspx');
  });
  
  it('4. Verify documentation', () => {
    cy.visitSP('SitePages/doctor/documentation.aspx');
  });
  
  it('5. Verify installation', () => {
    cy.visitSP('SitePages/doctor/installation.aspx');
  });
  
  it('6. Verify options', () => {
    cy.visitSP('SitePages/doctor/options.aspx');
  });
  
  it('7. Verify page creation', () => {
    cy.visitSP('SitePages/doctor/page-creation.aspx');
  });
  
  it('8. Verify shortcodes', () => {
    cy.visitSP('SitePages/tests/shortcodes.aspx');
  });
  
  it('8. Verify characters', () => {
    cy.visitSP('SitePages/tests/characters.aspx');
  });
  
  it('9. Verify codeblocks', () => {
    cy.visitSP('SitePages/tests/codeblocks.aspx');
  });
  
  it('10. Verify multilingual home', () => {
    cy.visitSP('SitePages/nl/home.aspx');
  });
  
  it('9. Verify multilingual installation', () => {
    cy.visitSP('SitePages/doctor/nl/installation.aspx');
  });
});


