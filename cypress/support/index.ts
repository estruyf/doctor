/// <reference types="cypress" />

// Import commands.js using ES2015 syntax:
import './commands';

Cypress.Cookies.defaults({
  preserve: ['FedAuth', 'rtFa']
});

// Catching all uncaught errors, sometimes it happens SP returns JS errors which make the tests fail
Cypress.on('uncaught:exception', (err, runnable) => {
  // Returning false here prevents Cypress from failing the test
  return false
})