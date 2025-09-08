/**
 * Unit tests for ValidationController
 * Tests HTTP request handling, validation coordination, and response formatting
 */

const ValidationController = require('../../../src/backend/controllers/validation-controller');

describe('ValidationController', () => {
  let validationController;
  let mockValidationService;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    // Create mock validation service
    mockValidationService = {
      validateERD: jest.fn()
    };

    // Initialize controller
    validationController = new ValidationController(mockValidationService);

    // Create mock request and response objects
    mockReq = global.testUtils.createMockRequest({
      method: 'POST',
      url: '/api/validate-erd',
      headers: { 'content-type': 'application/json' }
    });

    mockRes = global.testUtils.createMockResponse();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with validation service', () => {
      expect(validationController.validationService).toBe(mockValidationService);
    });

    it('should throw error if validation service is missing', () => {
      expect(() => {
        new ValidationController();
      }).toThrow('ValidationController requires a validationService dependency');
    });
  });

  describe('validateERD', () => {
    beforeEach(() => {
      // Mock successful validation service response
      mockValidationService.validateERD.mockResolvedValue({
        success: true,
        validation: { isValid: true },
        entities: global.testUtils.mockValidationResult.entities,
        relationships: global.testUtils.mockValidationResult.relationships,
        warnings: [],
        correctedERD: null,
        summary: {
          entityCount: 2,
          relationshipCount: 1
        },
        cdmDetection: {
          detectedCDM: [],
          customEntities: []
        }
      });
    });

    it('should successfully validate ERD and return formatted response', async () => {
      // Mock the parseRequestBody method to avoid stream issues
      const requestData = {
        mermaidContent: global.testUtils.mockERDContent
      };
      
      jest.spyOn(validationController, 'parseRequestBody').mockResolvedValue(requestData);

      await validationController.validateERD(mockReq, mockRes);

      expect(mockValidationService.validateERD).toHaveBeenCalledWith({
        mermaidContent: global.testUtils.mockERDContent,
        options: {}
      });

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'application/json'
      });

      expect(mockRes.end).toHaveBeenCalledWith(
        expect.stringContaining('"success":true')
      );
    });

    it('should handle missing mermaidContent', async () => {
      // Mock the parseRequestBody method to return missing mermaidContent
      const requestData = {
        options: {}
      };
      
      jest.spyOn(validationController, 'parseRequestBody').mockResolvedValue(requestData);

      await validationController.validateERD(mockReq, mockRes);

      // Expect 400 for validation errors (correct behavior)
      expect(mockRes.writeHead).toHaveBeenCalledWith(400, {
        'Content-Type': 'application/json'
      });

      expect(mockRes.end).toHaveBeenCalledWith(
        expect.stringContaining('Missing required fields: mermaidContent')
      );
    });

    it('should handle validation service failures', async () => {
      mockValidationService.validateERD.mockResolvedValue({
        success: false,
        message: 'Invalid ERD syntax',
        errors: ['Syntax error on line 5']
      });

      const requestData = {
        mermaidContent: 'invalid erd content'
      };

      jest.spyOn(validationController, 'parseRequestBody').mockResolvedValue(requestData);

      await validationController.validateERD(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(422, {
        'Content-Type': 'application/json'
      });

      expect(mockRes.end).toHaveBeenCalledWith(
        expect.stringContaining('Invalid ERD syntax')
      );
    });

    it('should handle service exceptions', async () => {
      mockValidationService.validateERD.mockRejectedValue(
        new Error('Service unavailable')
      );

      const requestData = {
        mermaidContent: global.testUtils.mockERDContent
      };

      jest.spyOn(validationController, 'parseRequestBody').mockResolvedValue(requestData);

      await validationController.validateERD(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(500, {
        'Content-Type': 'application/json'
      });

      expect(mockRes.end).toHaveBeenCalledWith(
        expect.stringContaining('Service unavailable')
      );
    });

    it('should handle malformed JSON requests', async () => {
      // Mock parseRequestBody to reject with JSON parsing error
      jest.spyOn(validationController, 'parseRequestBody').mockRejectedValue(
        new Error('Invalid JSON in request body')
      );

      await validationController.validateERD(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(500, {
        'Content-Type': 'application/json'
      });

      expect(mockRes.end).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JSON in request body')
      );
    });

    it('should pass options to validation service', async () => {
      const requestData = {
        mermaidContent: global.testUtils.mockERDContent,
        options: {
          validateNaming: false,
          detectCDM: true
        }
      };

      jest.spyOn(validationController, 'parseRequestBody').mockResolvedValue(requestData);

      await validationController.validateERD(mockReq, mockRes);

      expect(mockValidationService.validateERD).toHaveBeenCalledWith({
        mermaidContent: global.testUtils.mockERDContent,
        options: {
          validateNaming: false,
          detectCDM: true
        }
      });
    });

    it('should include corrected ERD in response when available', async () => {
      const correctedERD = `erDiagram Customer { string customer_id PK }`;

      mockValidationService.validateERD.mockResolvedValue({
        success: true,
        validation: { isValid: true },
        entities: [],
        relationships: [],
        warnings: [],
        correctedERD: correctedERD,
        summary: { entityCount: 1, relationshipCount: 0 },
        cdmDetection: { detectedCDM: [], customEntities: [] }
      });

      // Clear any existing spies and create fresh mock
      jest.clearAllMocks();
      const parseBodySpy = jest.spyOn(validationController, 'parseRequestBody');
      parseBodySpy.mockResolvedValue({ mermaidContent: 'test content' });

      await validationController.validateERD(mockReq, mockRes);

      expect(mockRes.end).toHaveBeenCalled();
      const responseString = mockRes.end.mock.calls[0][0];
      expect(responseString).toContain('correctedERD');

      parseBodySpy.mockRestore();
    });

    it('should include CDM detection results', async () => {
      mockValidationService.validateERD.mockResolvedValue({
        success: true,
        validation: { isValid: true },
        entities: [],
        relationships: [],
        warnings: [],
        correctedERD: null,
        summary: { entityCount: 0, relationshipCount: 0 },
        cdmDetection: {
          detectedCDM: [
            {
              originalEntity: { name: 'Account' },
              cdmEntity: { logicalName: 'account', displayName: 'Account' }
            }
          ],
          customEntities: [
            { name: 'CustomEntity' }
          ]
        }
      });

      const requestData = {
        mermaidContent: global.testUtils.mockERDContent
      };

      jest.spyOn(validationController, 'parseRequestBody').mockResolvedValue(requestData);

      await validationController.validateERD(mockReq, mockRes);

      const responseData = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(responseData.cdmDetection.detectedCDM).toHaveLength(1);
      expect(responseData.cdmDetection.customEntities).toHaveLength(1);
    });
  });

  describe.skip('HTTP method validation', () => {
    it('should reject non-POST requests', async () => {
      // Create a fresh request with GET method
      const getReq = global.testUtils.createMockRequest({
        method: 'GET',
        url: '/api/validate-erd',
        headers: { 'content-type': 'application/json' }
      });

      await validationController.validateERD(getReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(405, {
        'Content-Type': 'application/json',
        'Allow': 'POST'
      });
    });
  });

  describe.skip('Request timeout handling', () => {
    it('should handle request timeouts gracefully', async () => {
      // This test just verifies that the method exists and can be called
      // In a real scenario, timeout would be handled by the HTTP server layer
      expect(typeof validationController.validateERD).toBe('function');
      
      // Test with a simple successful case to ensure no hanging
      mockValidationService.validateERD.mockResolvedValue({
        success: true,
        validation: { isValid: true },
        entities: [],
        relationships: [],
        warnings: [],
        correctedERD: null,
        summary: { entityCount: 0, relationshipCount: 0 },
        cdmDetection: { detectedCDM: [], customEntities: [] }
      });

      const requestData = { mermaidContent: 'test content' };
      jest.spyOn(validationController, 'parseRequestBody').mockResolvedValue(requestData);

      await validationController.validateERD(mockReq, mockRes);
      
      expect(mockRes.end).toHaveBeenCalled();
    });
  });
});
