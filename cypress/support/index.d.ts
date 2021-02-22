/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
    visitSP: (pageUrl: string) => void
  }
}