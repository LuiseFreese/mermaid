/**
 * Security Headers Middleware
 * Adds common security headers to all responses
 */

class SecurityMiddleware {
  constructor(options = {}) {
    this.options = {
      // X-Content-Type-Options: Prevents MIME type sniffing
      contentTypeOptions: options.contentTypeOptions || 'nosniff',
      
      // X-Frame-Options: Prevents clickjacking
      frameOptions: options.frameOptions || 'DENY',
      
      // X-XSS-Protection: Enables XSS filtering
      xssProtection: options.xssProtection || '1; mode=block',
      
      // Cache-Control: Controls caching behavior
      cacheControl: options.cacheControl || 'no-cache, no-store, must-revalidate',
      
      ...options
    };
  }

  handle(req, res, next) {
    // Set security headers
    res.setHeader('X-Content-Type-Options', this.options.contentTypeOptions);
    res.setHeader('X-Frame-Options', this.options.frameOptions);
    res.setHeader('X-XSS-Protection', this.options.xssProtection);
    
    // Set cache control for API endpoints
    if (req.url && req.url.startsWith('/api/')) {
      res.setHeader('Cache-Control', this.options.cacheControl);
    }
    
    // Continue to next middleware
    next();
  }

  /**
   * Create security middleware for web applications
   */
  static createWebAppSecurity(options = {}) {
    return new SecurityMiddleware({
      contentTypeOptions: 'nosniff',
      frameOptions: 'DENY',
      xssProtection: '1; mode=block',
      cacheControl: 'no-cache, no-store, must-revalidate',
      ...options
    });
  }

  /**
   * Create security middleware for API endpoints
   */
  static createApiSecurity(options = {}) {
    return new SecurityMiddleware({
      contentTypeOptions: 'nosniff',
      frameOptions: 'DENY',
      xssProtection: '1; mode=block',
      cacheControl: 'no-cache, no-store, must-revalidate',
      ...options
    });
  }
}

module.exports = { SecurityMiddleware };
