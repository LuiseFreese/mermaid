/**
 * Storage Provider Tests
 * Tests for the storage abstraction layer
 */
const { LocalStorageProvider, AzureStorageProvider, StorageFactory } = require('../../src/backend/storage');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('Storage Providers', () => {
    let tempDir;
    
    beforeEach(async () => {
        // Create temporary directory for tests
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
    });

    afterEach(async () => {
        // Clean up temporary directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('StorageFactory', () => {
        test('should create local storage provider by default', () => {
            const storage = StorageFactory.create();
            expect(storage.getType()).toBe('local');
        });

        test('should create azure storage provider when configured', () => {
            const storage = StorageFactory.create({
                type: 'azure',
                accountName: 'testaccount'
            });
            expect(storage.getType()).toBe('azure');
        });

        test('should validate configuration', () => {
            const result = StorageFactory.validateConfig({
                type: 'azure',
                accountName: 'testaccount'
            });
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should return errors for invalid configuration', () => {
            const result = StorageFactory.validateConfig({
                type: 'invalid'
            });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Invalid storage type: invalid');
        });
    });

    describe('LocalStorageProvider', () => {
        let storage;

        beforeEach(async () => {
            storage = new LocalStorageProvider({
                baseDir: tempDir
            });
            await storage.initialize();
        });

        test('should save and load JSON data', async () => {
            const testData = { test: 'data', timestamp: new Date().toISOString() };
            
            await storage.save('test.json', testData);
            const loadedData = await storage.load('test.json');
            
            expect(loadedData).toEqual(testData);
        });

        test('should save and load string data', async () => {
            const testData = 'This is test string data';
            
            await storage.save('test.txt', testData);
            const loadedData = await storage.load('test.txt');
            
            expect(loadedData).toBe(testData);
        });

        test('should check if file exists', async () => {
            const testData = { test: 'data' };
            
            expect(await storage.exists('test.json')).toBe(false);
            
            await storage.save('test.json', testData);
            expect(await storage.exists('test.json')).toBe(true);
        });

        test('should delete files', async () => {
            const testData = { test: 'data' };
            
            await storage.save('test.json', testData);
            expect(await storage.exists('test.json')).toBe(true);
            
            await storage.delete('test.json');
            expect(await storage.exists('test.json')).toBe(false);
        });

        test('should list files', async () => {
            await storage.save('file1.json', { test: 1 });
            await storage.save('file2.json', { test: 2 });
            await storage.save('file3.txt', 'text');
            
            const allFiles = await storage.list();
            expect(allFiles).toContain('file1.json');
            expect(allFiles).toContain('file2.json');
            expect(allFiles).toContain('file3.txt');
            
            const jsonFiles = await storage.list('', { extension: '.json' });
            expect(jsonFiles).toContain('file1.json');
            expect(jsonFiles).toContain('file2.json');
            expect(jsonFiles).not.toContain('file3.txt');
        });

        test('should handle nested directories', async () => {
            const testData = { test: 'nested' };
            
            await storage.save('nested/dir/test.json', testData);
            const loadedData = await storage.load('nested/dir/test.json');
            
            expect(loadedData).toEqual(testData);
        });

        test('should return null for non-existent files', async () => {
            const loadedData = await storage.load('non-existent.json');
            expect(loadedData).toBeNull();
        });
    });

    describe('AzureStorageProvider', () => {
        // Note: These tests require Azure Storage Emulator (Azurite) or real Azure Storage
        // Skip in CI/CD unless emulator is available

        test.skip('should initialize with connection string', async () => {
            const storage = new AzureStorageProvider({
                connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
                containerName: 'test-container'
            });
            
            await expect(storage.initialize()).resolves.not.toThrow();
        });

        test.skip('should save and load data', async () => {
            const storage = new AzureStorageProvider({
                connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
                containerName: 'test-container'
            });
            
            await storage.initialize();
            
            const testData = { test: 'azure-data', timestamp: new Date().toISOString() };
            
            await storage.save('test/azure-test.json', testData);
            const loadedData = await storage.load('test/azure-test.json');
            
            expect(loadedData).toEqual(testData);
            
            // Cleanup
            await storage.delete('test/azure-test.json');
        });
    });
});