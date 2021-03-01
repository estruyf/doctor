/// <reference types="cypress" />

// Import commands.js using ES2015 syntax:
import './commands'

Cypress.Cookies.defaults({
  preserve: ['FedAuth', 'rtFa']
});