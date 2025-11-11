/**
 * Base Dataverse Service
 * Provides common functionality for all Dataverse services
 */

const axios = require('axios');
const http = require('http');
const https = require('https');

class BaseDataverseService {
  constructor(config = {}) {
    this.baseUrl = (config.dataverseUrl || config.DATAVERSE_URL || process.env.DATAVERSE_URL || '').replace(/\/$/, '');
    this.verbose = !!config.verbose;
    
    // Configure HTTP agents for better connection stability
    const httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000, // Request timeout
      freeSocketTimeout: 30000
    });

    const httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      freeSocketTimeout: 30000,
      // Additional connection stability options
      secureProtocol: 'TLSv1_2_method'
    });

    this.httpClient = axios.create({
      timeout: 120000, // 2 minutes for complex operations
      httpAgent,
      httpsAgent,
      maxRedirects: 5,
      validateStatus: (status) => status < 500 // Don't throw on 4xx errors
    });
  }

  // Utilities
  sleep(ms) { 
    return new Promise(r => setTimeout(r, ms)); 
  }

  _log(...args) { 
    if (this.verbose) console.log(...args); 
  }

  _warn(...args) { 
    console.warn(...args); 
  }

  _err(...args) { 
    console.error(...args); 
  }

  /**
   * Make HTTP request with authentication
   * @param {string} method - HTTP method
   * @param {string} url - Relative URL (without base URL)
   * @param {*} data - Request body data
   * @param {object} options - Additional request options
   * @returns {Promise<object>} Response data
   */
  async makeRequest(method, url, data, options = {}) {
    throw new Error('makeRequest must be implemented by derived class');
  }

  /**
   * Make HTTP request with retry logic
   * @param {string} method - HTTP method
   * @param {string} url - Relative URL
   * @param {*} data - Request body data
   * @param {object} options - Request options
   * @returns {Promise<object>} Response data
   */
  async makeRequestWithRetry(method, url, data, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const baseDelay = options.baseDelay || 1000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.makeRequest(method, url, data, options);
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Check if error is retryable
        if (this._isRetryableError(error)) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          this._warn(`Request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
          await this.sleep(delay);
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Determine if an error is retryable
   * @param {Error} error - The error to check
   * @returns {boolean} True if retryable
   */
  _isRetryableError(error) {
    if (!error.response) {
      // Network error, timeout, etc.
      return true;
    }
    
    const status = error.response.status;
    // Retry on server errors and specific client errors
    return status >= 500 || status === 429 || status === 408;
  }

  // Convenience HTTP methods
  async get(url, options = {}) {
    return this.makeRequest('GET', url, null, options);
  }

  async post(url, data, options = {}) {
    return this.makeRequest('POST', url, data, options);
  }

  async put(url, data, options = {}) {
    return this.makeRequest('PUT', url, data, options);
  }

  async delete(url, options = {}) {
    return this.makeRequest('DELETE', url, null, options);
  }

  async patch(url, data, options = {}) {
    return this.makeRequest('PATCH', url, data, options);
  }
}

module.exports = { BaseDataverseService };