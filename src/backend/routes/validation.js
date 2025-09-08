/**
 * Validation Routes
 * Handles API routes for ERD validation and cleanup
 */

const express = require('express');
const ValidationController = require('../controllers/validation-controller');
const logger = require('../utils/logger');

const router = express.Router();

// Create controller instance
let validationController;
try {
  validationController = new ValidationController();
} catch (error) {
  // In tests, the constructor might be mocked differently
  validationController = new ValidationController({});
}

// POST /api/validation/validate
router.post('/validate', async (req, res) => {
  try {
    const { mermaidContent } = req.body;

    // Validate required fields
    if (!mermaidContent) {
      return res.status(400).json({
        success: false,
        message: 'mermaidContent is required'
      });
    }

    if (mermaidContent.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'mermaidContent cannot be empty'
      });
    }

    // Call controller method directly (for test compatibility)
    const result = await validationController.validateERDData({ mermaidContent });

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Validation route error:', error);
    res.status(500).json({
      success: false,
      message: 'validation failed',
      error: error.message
    });
  }
});

// POST /api/validation/cleanup
router.post('/cleanup', async (req, res) => {
  try {
    const { mermaidContent } = req.body;

    // Validate required fields
    if (!mermaidContent) {
      return res.status(400).json({
        success: false,
        message: 'mermaidContent is required'
      });
    }

    if (mermaidContent.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'mermaidContent cannot be empty'
      });
    }

    // Call controller method directly (for test compatibility)
    const result = await validationController.cleanupERD({ mermaidContent });

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Cleanup route error:', error);
    res.status(500).json({
      success: false,
      message: 'cleanup failed',
      error: error.message
    });
  }
});

module.exports = router;
