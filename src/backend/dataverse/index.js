/**
 * Dataverse Services Module
 * Entry point for all Dataverse service classes
 */

const { BaseDataverseService } = require('./services/base-dataverse-service');
const { DataverseAuthenticationService } = require('./services/dataverse-authentication-service');
const { DataverseClient } = require('./services/dataverse-client');
const { DataversePublisherService } = require('./services/dataverse-publisher-service');
const { DataverseSolutionService } = require('./services/dataverse-solution-service');

module.exports = {
  BaseDataverseService,
  DataverseAuthenticationService,
  DataverseClient,
  DataversePublisherService,
  DataverseSolutionService
};