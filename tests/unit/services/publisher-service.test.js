/**
 * Unit tests for PublisherService
 * Tests publisher management functionality
 */

const { PublisherService } = require('../../../src/backend/services/publisher-service');

describe('PublisherService', () => {
  let publisherService;
  let mockDataverseRepository;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockDataverseRepository = {
      getPublishers: jest.fn(),
      createPublisher: jest.fn(),
      getPublisher: jest.fn()
    };

    publisherService = new PublisherService({
      dataverseRepository: mockDataverseRepository,
      logger: mockLogger
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with dataverse repository', () => {
      expect(publisherService.name).toBe('PublisherService');
      expect(publisherService.dataverseRepository).toBe(mockDataverseRepository);
    });

    it('should throw error if dataverse repository is missing', () => {
      expect(() => {
        new PublisherService({});
      }).toThrow('PublisherService missing required dependencies: dataverseRepository');
    });
  });

  describe('getPublishers', () => {
    it('should retrieve publishers successfully', async () => {
      const mockPublishers = [
        { uniqueName: 'publisher1', friendlyName: 'Publisher 1' },
        { uniqueName: 'publisher2', friendlyName: 'Publisher 2' }
      ];

      mockDataverseRepository.getPublishers.mockResolvedValue({
        success: true,
        data: mockPublishers
      });

      const result = await publisherService.getPublishers();

      expect(result.success).toBe(true);
      expect(result.publishers).toEqual(mockPublishers);
      expect(result.count).toBe(2);
      expect(result.message).toBe('Publishers retrieved successfully');
    });

    it('should handle empty publishers list', async () => {
      mockDataverseRepository.getPublishers.mockResolvedValue({
        success: true,
        data: []
      });

      const result = await publisherService.getPublishers();

      expect(result.success).toBe(true);
      expect(result.publishers).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should handle repository failures', async () => {
      mockDataverseRepository.getPublishers.mockResolvedValue({
        success: false,
        message: 'Connection failed'
      });

      const result = await publisherService.getPublishers();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Connection failed');
    });

    it('should handle repository exceptions', async () => {
      mockDataverseRepository.getPublishers.mockRejectedValue(
        new Error('Network timeout')
      );

      await expect(
        publisherService.getPublishers()
      ).rejects.toThrow('getPublishers failed: Network timeout');
    });
  });

  describe('createPublisher', () => {
    const validPublisherData = {
      uniqueName: 'testpublisher',
      friendlyName: 'Test Publisher',
      prefix: 'tst'
    };

    it('should create publisher successfully', async () => {
      // Mock the duplicate check
      mockDataverseRepository.getPublishers.mockResolvedValue({
        success: true,
        data: []
      });

      mockDataverseRepository.createPublisher.mockResolvedValue({
        success: true,
        data: { id: 'new-publisher-id' }
      });

      const result = await publisherService.createPublisher(validPublisherData);

      expect(result.success).toBe(true);
      expect(result.id).toBe('new-publisher-id');
      expect(mockDataverseRepository.createPublisher).toHaveBeenCalledWith(validPublisherData);
    });

    it('should validate required fields', async () => {
      const invalidData = { uniqueName: 'test' }; // missing friendlyName and prefix

      await expect(
        publisherService.createPublisher(invalidData)
      ).rejects.toThrow('Missing required parameters: friendlyName, prefix');
    });

    it('should validate prefix format - too short', async () => {
      const invalidData = {
        ...validPublisherData,
        prefix: 'x'
      };

      await expect(
        publisherService.createPublisher(invalidData)
      ).rejects.toThrow('Publisher prefix must be 2-8 lowercase letters');
    });

    it('should validate prefix format - too long', async () => {
      const invalidData = {
        ...validPublisherData,
        prefix: 'verylongprefix'
      };

      await expect(
        publisherService.createPublisher(invalidData)
      ).rejects.toThrow('Publisher prefix must be 2-8 lowercase letters');
    });

    it('should validate prefix format - uppercase letters', async () => {
      const invalidData = {
        ...validPublisherData,
        prefix: 'TST'
      };

      await expect(
        publisherService.createPublisher(invalidData)
      ).rejects.toThrow('Publisher prefix must be 2-8 lowercase letters');
    });

    it('should validate prefix format - numbers and special chars', async () => {
      const invalidData = {
        ...validPublisherData,
        prefix: 'ts1'
      };

      await expect(
        publisherService.createPublisher(invalidData)
      ).rejects.toThrow('Publisher prefix must be 2-8 lowercase letters');
    });

    it('should handle creation failures', async () => {
      // Mock the duplicate check
      mockDataverseRepository.getPublishers.mockResolvedValue({
        success: true,
        data: []
      });

      mockDataverseRepository.createPublisher.mockResolvedValue({
        success: false,
        message: 'Publisher already exists'
      });

      const result = await publisherService.createPublisher(validPublisherData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Publisher already exists');
    });
  });

  describe('input validation', () => {
    it('should handle undefined input gracefully', async () => {
      await expect(
        publisherService.createPublisher()
      ).rejects.toThrow("Cannot read properties of undefined (reading 'uniqueName')");
    });

    it('should handle null input gracefully', async () => {
      await expect(
        publisherService.createPublisher(null)
      ).rejects.toThrow("Cannot read properties of null (reading 'uniqueName')");
    });

    it('should validate parameter types', async () => {
      const invalidData = {
        uniqueName: 123, // should be string
        friendlyName: 'Test',
        prefix: 'tst'
      };

      await expect(
        publisherService.createPublisher(invalidData)
      ).rejects.toThrow("Parameter 'uniqueName' must be of type string, got number");
    });
  });

  describe('error handling', () => {
    it('should log operation failures', async () => {
      mockDataverseRepository.getPublishers.mockRejectedValue(
        new Error('Database error')
      );

      try {
        await publisherService.getPublishers();
      } catch (error) {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('getPublishers failed'),
        'Database error'
      );
    });
  });
});
