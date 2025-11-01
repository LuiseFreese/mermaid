/**
 * Azure Storage Provider
 * Implements storage operations using Azure Blob Storage
 */
const { StorageProvider } = require('./storage-provider');
const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential, ManagedIdentityCredential } = require('@azure/identity');

class AzureStorageProvider extends StorageProvider {
    constructor(config = {}) {
        super({ ...config, type: 'azure' });
        
        // Configuration
        this.accountName = config.accountName || process.env.AZURE_STORAGE_ACCOUNT_NAME;
        this.containerName = config.containerName || 'deployment-history';
        this.connectionString = config.connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING;
        
        // Initialize blob service client
        this.blobServiceClient = null;
        this.containerClient = null;
        
        if (!this.accountName && !this.connectionString) {
            throw new Error('Azure Storage requires either accountName or connectionString');
        }
    }

    /**
     * Initialize Azure Storage client and container
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            // Initialize blob service client
            if (this.connectionString) {
                // Use connection string (for local development with Azurite)
                this.blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
            } else {
                // Use managed identity (for production)
                let credential;
                const managedIdentityClientId = process.env.MANAGED_IDENTITY_CLIENT_ID;
                
                if (managedIdentityClientId) {
                    // Use user-assigned managed identity with specific client ID
                    credential = new ManagedIdentityCredential(managedIdentityClientId);
                } else {
                    // Fallback to default credential chain
                    credential = new DefaultAzureCredential();
                }
                
                this.blobServiceClient = new BlobServiceClient(
                    `https://${this.accountName}.blob.core.windows.net`,
                    credential
                );
            }

            // Get container client
            this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
            
            // Create container if it doesn't exist
            await this.containerClient.createIfNotExists({
                access: 'blob',
                metadata: {
                    purpose: 'deployment-history',
                    service: 'mermaid-to-dataverse'
                }
            });
            
            console.log(`✅ Azure Storage initialized: ${this.containerName}`);
        } catch (error) {
            throw new Error(`Failed to initialize Azure Storage: ${error.message}`);
        }
    }

    /**
     * Save data to Azure Blob Storage
     * @param {string} key - Blob name/path
     * @param {Object|string} data - Data to store
     * @param {Object} options - Storage options
     * @returns {Promise<void>}
     */
    async save(key, data, options = {}) {
        try {
            if (!this.containerClient) {
                await this.initialize();
            }

            // Convert data to JSON string if it's an object
            const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
            
            // Get blob client
            const blobClient = this.containerClient.getBlockBlobClient(key);
            
            // Upload data with metadata
            await blobClient.upload(content, content.length, {
                blobHTTPHeaders: {
                    blobContentType: 'application/json'
                },
                metadata: {
                    uploadedAt: new Date().toISOString(),
                    service: 'mermaid-to-dataverse',
                    ...options.metadata
                },
                ...options
            });
        } catch (error) {
            throw new Error(`Failed to save to Azure Storage: ${error.message}`);
        }
    }

    /**
     * Load data from Azure Blob Storage
     * @param {string} key - Blob name/path
     * @param {Object} options - Load options
     * @returns {Promise<Object|string|null>}
     */
    async load(key, options = {}) {
        try {
            if (!this.containerClient) {
                await this.initialize();
            }

            const blobClient = this.containerClient.getBlockBlobClient(key);
            
            // Check if blob exists
            const exists = await blobClient.exists();
            if (!exists) {
                return null;
            }
            
            // Download blob content
            const downloadResponse = await blobClient.download(0, undefined, options);
            const content = await this.streamToString(downloadResponse.readableStreamBody);
            
            // Try to parse as JSON, return as string if parsing fails
            try {
                return JSON.parse(content);
            } catch {
                return content;
            }
        } catch (error) {
            throw new Error(`Failed to load from Azure Storage: ${error.message}`);
        }
    }

    /**
     * Check if blob exists in Azure Storage
     * @param {string} key - Blob name/path
     * @returns {Promise<boolean>}
     */
    async exists(key) {
        try {
            if (!this.containerClient) {
                await this.initialize();
            }

            const blobClient = this.containerClient.getBlockBlobClient(key);
            return await blobClient.exists();
        } catch (error) {
            throw new Error(`Failed to check existence in Azure Storage: ${error.message}`);
        }
    }

    /**
     * Delete blob from Azure Storage
     * @param {string} key - Blob name/path
     * @returns {Promise<void>}
     */
    async delete(key) {
        try {
            if (!this.containerClient) {
                await this.initialize();
            }

            const blobClient = this.containerClient.getBlockBlobClient(key);
            
            // Delete blob if it exists
            await blobClient.deleteIfExists();
        } catch (error) {
            throw new Error(`Failed to delete from Azure Storage: ${error.message}`);
        }
    }

    /**
     * List blobs in Azure Storage
     * @param {string} prefix - Blob name prefix to filter by
     * @param {Object} options - List options
     * @returns {Promise<string[]>}
     */
    async list(prefix = '', options = {}) {
        try {
            if (!this.containerClient) {
                await this.initialize();
            }

            const blobs = [];
            const listOptions = {
                prefix: prefix || undefined
            };

            // List blobs with prefix
            for await (const blob of this.containerClient.listBlobsFlat(listOptions)) {
                // Filter by extension if specified
                if (!options.extension || blob.name.endsWith(options.extension)) {
                    blobs.push(blob.name);
                }
            }

            return blobs;
        } catch (error) {
            throw new Error(`Failed to list blobs in Azure Storage: ${error.message}`);
        }
    }

    /**
     * Get blob URL
     * @param {string} key - Blob name/path
     * @returns {string}
     */
    getBlobUrl(key) {
        if (!this.containerClient) {
            throw new Error('Azure Storage not initialized');
        }
        
        const blobClient = this.containerClient.getBlockBlobClient(key);
        return blobClient.url;
    }

    /**
     * Get container name
     * @returns {string}
     */
    getContainerName() {
        return this.containerName;
    }

    /**
     * Helper method to convert stream to string
     * @param {NodeJS.ReadableStream} readableStream - Stream to convert
     * @returns {Promise<string>}
     */
    async streamToString(readableStream) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            readableStream.on('data', (data) => {
                chunks.push(data.toString());
            });
            readableStream.on('end', () => {
                resolve(chunks.join(''));
            });
            readableStream.on('error', reject);
        });
    }
}

module.exports = { AzureStorageProvider };