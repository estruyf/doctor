/// <reference types="cypress" />

// Import commands.js using ES2015 syntax:
import './commands';
const addContext = require('mochawesome/addContext');

Cypress.Cookies.defaults({
  preserve: ['FedAuth', 'rtFa']
});

// Catching all uncaught errors, sometimes it happens SP returns JS errors which make the tests fail
Cypress.on('uncaught:exception', (err, runnable) => {
  // Returning false here prevents Cypress from failing the test
  return false
});

Cypress.Screenshot.defaults({
  onAfterScreenshot(_el, details) {
    if (!details.path) {
      return;
    }

    cy.once('test:after:run', (test) => {
      const fullPath = details.path;
      const pathSplit = fullPath.split('cypress/');
      const normalizedScreenshotPath = pathSplit.pop();

      addContext(
        { test },
        {
          title: normalizedScreenshotPath.includes('(failed)') ? 'Failed screenshot' : 'Screenshot',
          value: normalizedScreenshotPath
        }
      );
    });
  },
});