/**
 * Unit tests for GlobalChoicesService
 * Tests global choice set management functionality
 */

const { GlobalChoicesService } = require('../../../src/backend/services/global-choices-service');

describe('GlobalChoicesService', () => {
  let globalChoicesService;
  let mockDataverseRepository;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockDataverseRepository = {
      getGlobalChoiceSets: jest.fn(),
      createGlobalChoiceSet: jest.fn(),
      getGlobalChoiceSet: jest.fn(),
      addGlobalChoicesToSolution: jest.fn()
    };

    globalChoicesService = new GlobalChoicesService({
      dataverseRepository: mockDataverseRepository,
      logger: mockLogger
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with dataverse repository', () => {
      expect(globalChoicesService.name).toBe('GlobalChoicesService');
      expect(globalChoicesService.dataverseRepository).toBe(mockDataverseRepository);
    });

    it('should throw error if dataverse repository is missing', () => {
      expect(() => {
        new GlobalChoicesService({});
      }).toThrow('GlobalChoicesService missing required dependencies: dataverseRepository');
    });
  });

  describe('getGlobalChoices', () => {
    it('should retrieve global choices with default options', async () => {
      const mockChoices = {
        success: true,
        data: {
          all: [
            { LogicalName: 'choice1', Name: 'Choice 1' },
            { LogicalName: 'choice2', Name: 'Choice 2' }
          ]
        }
      };

      mockDataverseRepository.getGlobalChoiceSets.mockResolvedValue(mockChoices);

      const result = await globalChoicesService.getGlobalChoices();

      expect(result.success).toBe(true);
      expect(result.all).toEqual(mockChoices.data.all);
      expect(mockDataverseRepository.getGlobalChoiceSets).toHaveBeenCalledWith({
        includeBuiltIn: true,
        includeCustom: true,
        limit: undefined,
        filter: undefined
      });
    });

    it('should handle custom query options', async () => {
      const mockChoices = {
        success: true,
        data: { all: [] }
      };

      mockDataverseRepository.getGlobalChoiceSets.mockResolvedValue(mockChoices);

      const options = {
        includeBuiltIn: false,
        includeCustom: true,
        limit: 10,
        filter: 'test'
      };

      await globalChoicesService.getGlobalChoices(options);

      expect(mockDataverseRepository.getGlobalChoiceSets).toHaveBeenCalledWith(options);
    });

    it('should handle repository failures', async () => {
      mockDataverseRepository.getGlobalChoiceSets.mockResolvedValue({
        success: false,
        message: 'Connection failed'
      });

      const result = await globalChoicesService.getGlobalChoices();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Connection failed');
    });
  });

  describe('createCustomGlobalChoice', () => {
    const validChoiceData = {
      name: 'test_choice',
      displayName: 'Test Choice',
      options: [
        { label: 'Option 1', value: 1 },
        { label: 'Option 2', value: 2 }
      ]
    };

    beforeEach(() => {
      // Mock successful duplicate check
      mockDataverseRepository.getGlobalChoiceSets.mockResolvedValue({
        success: true,
        data: { all: [] }
      });
    });

    it('should create custom global choice successfully', async () => {
      mockDataverseRepository.createGlobalChoiceSet.mockResolvedValue({
        success: true,
        data: { id: 'new-choice-id' }
      });

      const result = await globalChoicesService.createCustomGlobalChoice(validChoiceData);

      expect(result.success).toBe(true);
      expect(result.id).toBe('new-choice-id');
      expect(mockDataverseRepository.createGlobalChoiceSet).toHaveBeenCalledWith(validChoiceData);
    });

    it('should validate required fields', async () => {
      const invalidData = { name: 'test' }; // missing options

      await expect(
        globalChoicesService.createCustomGlobalChoice(invalidData)
      ).rejects.toThrow('Missing required parameters: options');
    });

    it('should validate options array', async () => {
      const invalidData = {
        name: 'test_choice',
        options: 'not an array'
      };

      await expect(
        globalChoicesService.createCustomGlobalChoice(invalidData)
      ).rejects.toThrow("Parameter 'options' must be of type object, got string");
    });

    it('should validate empty options array', async () => {
      const invalidData = {
        name: 'test_choice',
        options: []
      };

      await expect(
        globalChoicesService.createCustomGlobalChoice(invalidData)
      ).rejects.toThrow('Options must be a non-empty array');
    });

    it('should validate option structure', async () => {
      const invalidData = {
        name: 'test_choice',
        options: [{ value: 1 }] // missing label
      };

      await expect(
        globalChoicesService.createCustomGlobalChoice(invalidData)
      ).rejects.toThrow('Option at index 0 must have a string label');
    });

    it('should validate option value type', async () => {
      const invalidData = {
        name: 'test_choice',
        options: [{ label: 'Test', value: 'not a number' }]
      };

      await expect(
        globalChoicesService.createCustomGlobalChoice(invalidData)
      ).rejects.toThrow('Option at index 0 value must be a number if provided');
    });

    it('should check for duplicate choice names', async () => {
      mockDataverseRepository.getGlobalChoiceSets.mockResolvedValue({
        success: true,
        data: {
          all: [{ LogicalName: 'test_choice', Name: 'Test Choice' }]
        }
      });

      await expect(
        globalChoicesService.createCustomGlobalChoice(validChoiceData)
      ).rejects.toThrow("Global choice set with name 'test_choice' already exists");
    });

    it('should handle creation failures', async () => {
      mockDataverseRepository.createGlobalChoiceSet.mockResolvedValue({
        success: false,
        message: 'Creation failed'
      });

      const result = await globalChoicesService.createCustomGlobalChoice(validChoiceData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Creation failed');
    });
  });

  describe('error handling', () => {
    it('should handle repository connection errors', async () => {
      mockDataverseRepository.getGlobalChoiceSets.mockRejectedValue(
        new Error('Network timeout')
      );

      await expect(
        globalChoicesService.getGlobalChoices()
      ).rejects.toThrow('getGlobalChoices failed: Network timeout');
    });

    it('should log operation failures', async () => {
      mockDataverseRepository.getGlobalChoiceSets.mockRejectedValue(
        new Error('Database error')
      );

      try {
        await globalChoicesService.getGlobalChoices();
      } catch (error) {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('getGlobalChoices failed'),
        'Database error'
      );
    });
  });

  describe('input validation', () => {
    it('should handle undefined input gracefully', async () => {
      await expect(
        globalChoicesService.createCustomGlobalChoice()
      ).rejects.toThrow("Cannot read properties of undefined (reading 'name')");
    });

    it('should handle null input gracefully', async () => {
      await expect(
        globalChoicesService.createCustomGlobalChoice(null)
      ).rejects.toThrow("Cannot read properties of null (reading 'name')");
    });
  });
});
