// cypress/plugins/index.js
/// <reference types="cypress" />

import { NodeAuth } from './node-auth';

/**
 * @type {Cypress.PluginConfig}
 */
export default (on: any, config: any) => {
  on('task', { NodeAuth })
};