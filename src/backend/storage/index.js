/**
 * Storage Module
 * Exports all storage-related classes and utilities
 */

const { StorageProvider } = require('./storage-provider');
const { LocalStorageProvider } = require('./local-storage-provider');
const { AzureStorageProvider } = require('./azure-storage-provider');
const { StorageFactory } = require('./storage-factory');

module.exports = {
    StorageProvider,
    LocalStorageProvider,
    AzureStorageProvider,
    StorageFactory
};