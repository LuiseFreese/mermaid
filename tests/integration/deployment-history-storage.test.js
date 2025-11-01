/**
 * Deployment History Service Integration Tests (Storage Enhanced)
 * Tests the deployment history service with different storage backends
 */
const { DeploymentHistoryService } = require('../../src/backend/services/deployment-history-service');
const { LocalStorageProvider, StorageFactory } = require('../../src/backend/storage');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('DeploymentHistoryService with Storage Abstraction', () => {
    let tempDir;
    let deploymentHistoryService;
    
    beforeEach(async () => {
        // Create temporary directory for tests
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deployment-history-test-'));
        
        // Initialize service with local storage
        const storage = new LocalStorageProvider({ baseDir: tempDir });
        deploymentHistoryService = new DeploymentHistoryService({ storage });
        await deploymentHistoryService.initializeStorage();
    });

    afterEach(async () => {
        // Clean up temporary directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('Deployment Recording', () => {
        test('should record deployment with all metadata', async () => {
            const deploymentData = {
                environmentSuffix: 'test',
                environmentId: 'test-env-123',
                environmentName: 'Test Environment',
                environmentUrl: 'https://test.crm.dynamics.com',
                erdContent: 'erDiagram\n  Customer {\n    id int\n  }',
                solutionName: 'TestSolution',
                publisherName: 'TestPublisher',
                status: 'completed',
                deploymentLogs: ['Log entry 1', 'Log entry 2']
            };

            const deploymentId = await deploymentHistoryService.recordDeployment(deploymentData);
            
            expect(deploymentId).toBeDefined();
            expect(deploymentId).toMatch(/^dep_\d+_[a-f0-9]{8}$/);
            
            // Verify deployment was saved
            const savedDeployment = await deploymentHistoryService.getDeployment(deploymentId);
            expect(savedDeployment).toBeDefined();
            expect(savedDeployment.environmentId).toBe('test-env-123');
            expect(savedDeployment.environmentName).toBe('Test Environment');
            expect(savedDeployment.environmentUrl).toBe('https://test.crm.dynamics.com');
            expect(savedDeployment.metadata.storageType).toBe('local');
        });

        test('should update deployment status', async () => {
            const deploymentData = {
                environmentSuffix: 'test',
                erdContent: 'test',
                status: 'pending'
            };

            const deploymentId = await deploymentHistoryService.recordDeployment(deploymentData);
            
            await deploymentHistoryService.updateDeployment(deploymentId, 'completed', {
                duration: 30000,
                entityCount: 5
            });
            
            const updatedDeployment = await deploymentHistoryService.getDeployment(deploymentId);
            expect(updatedDeployment.status).toBe('completed');
            expect(updatedDeployment.duration).toBe(30000);
            expect(updatedDeployment.entityCount).toBe(5);
            expect(updatedDeployment.lastUpdated).toBeDefined();
        });
    });

    describe('Deployment History', () => {
        test('should retrieve deployment history', async () => {
            // Create multiple deployments
            const deployments = [];
            for (let i = 0; i < 3; i++) {
                const deploymentData = {
                    environmentSuffix: 'test',
                    environmentId: 'test-env-123',
                    erdContent: `test ${i}`,
                    status: 'completed'
                };
                const deploymentId = await deploymentHistoryService.recordDeployment(deploymentData);
                deployments.push(deploymentId);
                
                // Add small delay to ensure different timestamps
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            const history = await deploymentHistoryService.getDeploymentHistory('test', 10);
            
            expect(history).toHaveLength(3);
            // Should be sorted by timestamp (newest first)
            expect(new Date(history[0].timestamp)).toBeInstanceOf(Date);
            expect(new Date(history[0].timestamp) >= new Date(history[1].timestamp)).toBe(true);
        });

        test('should limit deployment history results', async () => {
            // Create 5 deployments
            for (let i = 0; i < 5; i++) {
                const deploymentData = {
                    environmentSuffix: 'test',
                    erdContent: `test ${i}`,
                    status: 'completed'
                };
                await deploymentHistoryService.recordDeployment(deploymentData);
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            const history = await deploymentHistoryService.getDeploymentHistory('test', 3);
            expect(history).toHaveLength(3);
        });

        test('should return empty history for non-existent environment', async () => {
            const history = await deploymentHistoryService.getDeploymentHistory('non-existent', 10);
            expect(history).toHaveLength(0);
        });
    });

    describe('Environment Management', () => {
        test('should get all environments with deployment counts', async () => {
            // Create deployments in different environments
            await deploymentHistoryService.recordDeployment({
                environmentSuffix: 'dev',
                erdContent: 'test',
                status: 'completed'
            });
            
            await deploymentHistoryService.recordDeployment({
                environmentSuffix: 'prod',
                erdContent: 'test',
                status: 'completed'
            });
            
            await deploymentHistoryService.recordDeployment({
                environmentSuffix: 'dev',
                erdContent: 'test2',
                status: 'completed'
            });

            const environments = await deploymentHistoryService.getAllEnvironments();
            
            expect(environments).toHaveLength(2);
            
            const devEnv = environments.find(e => e.environmentSuffix === 'dev');
            const prodEnv = environments.find(e => e.environmentSuffix === 'prod');
            
            expect(devEnv).toBeDefined();
            expect(devEnv.deploymentCount).toBe(2);
            expect(prodEnv).toBeDefined();
            expect(prodEnv.deploymentCount).toBe(1);
        });
    });

    describe('Cleanup Operations', () => {
        test('should delete specific deployment', async () => {
            const deploymentData = {
                environmentSuffix: 'test',
                erdContent: 'test',
                status: 'completed'
            };

            const deploymentId = await deploymentHistoryService.recordDeployment(deploymentData);
            
            // Verify deployment exists
            expect(await deploymentHistoryService.getDeployment(deploymentId)).toBeDefined();
            
            // Delete deployment
            await deploymentHistoryService.deleteDeployment(deploymentId, 'test');
            
            // Verify deployment is gone
            expect(await deploymentHistoryService.getDeployment(deploymentId)).toBeNull();
            
            // Verify it's removed from history
            const history = await deploymentHistoryService.getDeploymentHistory('test', 10);
            expect(history.find(d => d.deploymentId === deploymentId)).toBeUndefined();
        });

        test('should clean up old deployments', async () => {
            // Set a low retention limit for testing
            deploymentHistoryService.maxHistoryEntries = 2;
            
            // Create 4 deployments
            const deploymentIds = [];
            for (let i = 0; i < 4; i++) {
                const deploymentData = {
                    environmentSuffix: 'test',
                    erdContent: `test ${i}`,
                    status: 'completed'
                };
                const deploymentId = await deploymentHistoryService.recordDeployment(deploymentData);
                deploymentIds.push(deploymentId);
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Should only have the latest 2 deployments
            const history = await deploymentHistoryService.getDeploymentHistory('test', 10);
            expect(history).toHaveLength(2);
            
            // Verify the oldest deployments were deleted
            expect(await deploymentHistoryService.getDeployment(deploymentIds[0])).toBeNull();
            expect(await deploymentHistoryService.getDeployment(deploymentIds[1])).toBeNull();
            expect(await deploymentHistoryService.getDeployment(deploymentIds[2])).toBeDefined();
            expect(await deploymentHistoryService.getDeployment(deploymentIds[3])).toBeDefined();
        });
    });

    describe('Storage Provider Integration', () => {
        test('should report storage provider information', () => {
            const storageInfo = deploymentHistoryService.getStorageInfo();
            
            expect(storageInfo.type).toBe('local');
            expect(storageInfo.config).toBeDefined();
        });

        test('should work with StorageFactory', async () => {
            const storage = StorageFactory.create({
                type: 'local',
                baseDir: tempDir
            });
            
            const service = new DeploymentHistoryService({ storage });
            await service.initializeStorage();
            
            const deploymentData = {
                environmentSuffix: 'factory-test',
                erdContent: 'test',
                status: 'completed'
            };

            const deploymentId = await service.recordDeployment(deploymentData);
            expect(deploymentId).toBeDefined();
            
            const savedDeployment = await service.getDeployment(deploymentId);
            expect(savedDeployment).toBeDefined();
            expect(savedDeployment.metadata.storageType).toBe('local');
        });
    });

    describe('Migration Support', () => {
        test('should migrate from local storage', async () => {
            // Create old-style deployment files
            const legacyDir = path.join(tempDir, 'legacy');
            await fs.mkdir(legacyDir, { recursive: true });
            
            // Create a legacy deployment record
            const legacyDeployment = {
                deploymentId: 'legacy_123',
                timestamp: new Date().toISOString(),
                environmentSuffix: 'legacy',
                status: 'completed'
            };
            await fs.writeFile(
                path.join(legacyDir, 'legacy_123.json'),
                JSON.stringify(legacyDeployment, null, 2)
            );
            
            // Create a legacy index
            const legacyIndex = {
                deployments: [{
                    deploymentId: 'legacy_123',
                    timestamp: legacyDeployment.timestamp,
                    status: 'completed'
                }]
            };
            await fs.writeFile(
                path.join(legacyDir, 'legacy_index.json'),
                JSON.stringify(legacyIndex, null, 2)
            );

            // Migrate to new storage
            const result = await deploymentHistoryService.migrateFromLocalStorage(legacyDir);
            
            expect(result.migratedDeployments).toBe(1);
            expect(result.migratedIndexes).toBe(1);
            expect(result.errors).toHaveLength(0);
            
            // Verify migrated data is accessible
            const migratedDeployment = await deploymentHistoryService.getDeployment('legacy_123');
            expect(migratedDeployment).toBeDefined();
            expect(migratedDeployment.deploymentId).toBe('legacy_123');
        });
    });
});