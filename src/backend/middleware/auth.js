/**


 * Azure AD JWT Authentication Middleware


 * 


 * Validates JWT tokens issued by Azure AD (Microsoft Entra ID)


 * and attaches user information to the request object.


 * 


 * Environment Variables:


 * - AZURE_AD_TENANT_ID: Azure AD Tenant ID


 * - AZURE_AD_CLIENT_ID: Application (client) ID


 * - AUTH_ENABLED: Set to 'false' to bypass authentication (local dev only)


 */





const jwt = require('jsonwebtoken');


const jwksClient = require('jwks-rsa');





// Configuration


function getConfig() {


  return {


    AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID,


    AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,


    AUTH_ENABLED: process.env.AUTH_ENABLED !== 'false',


  };


}





// JWKS client to fetch Azure AD signing keys (lazy-loaded to avoid initialization in tests)
let client = null;

function getJwksClient() {
  const config = getConfig();
  if (!client && config.AUTH_ENABLED && config.AZURE_AD_TENANT_ID) {
    client = jwksClient({
      jwksUri: `https://login.microsoftonline.com/${config.AZURE_AD_TENANT_ID}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }
  return client;
}





/**


 * Get the signing key from Azure AD


 */


function getKey(header, callback) {
  const jwksClient = getJwksClient();
  if (!jwksClient) {
    return callback(new Error('JWKS client not initialized'));
  }

  jwksClient.getSigningKey(header.kid, (err, key) => {


    if (err) {


      return callback(err);


    }


    const signingKey = key.publicKey || key.rsaPublicKey;


    callback(null, signingKey);


  });


}





/**


 * Verify JWT token


 */


function verifyToken(token) {


  return new Promise((resolve, reject) => {


    const config = getConfig();


    jwt.verify(


      token,


      getKey,


      {


        audience: config.AZURE_AD_CLIENT_ID, // Must match the client ID


        issuer: `https://login.microsoftonline.com/${config.AZURE_AD_TENANT_ID}/v2.0`, // Must match tenant


        algorithms: ['RS256'], // Azure AD uses RS256


      },


      (err, decoded) => {


        if (err) {


          return reject(err);


        }


        resolve(decoded);


      }


    );


  });


}





/**


 * Authentication Middleware


 */


async function authenticateToken(req, res, next) {


  const config = getConfig();


  


  // Bypass authentication if disabled (local development)


  if (!config.AUTH_ENABLED) {


    console.log('[Auth] Authentication bypassed (AUTH_ENABLED=false)');


    req.user = {


      oid: 'local-dev-user',


      email: 'dev@localhost',


      name: 'Local Development User',


      isAuthenticated: false,


    };


    return next();


  }





  // Validate configuration


  if (!config.AZURE_AD_TENANT_ID || !config.AZURE_AD_CLIENT_ID) {


    console.error('[Auth] Missing Azure AD configuration');


    res.writeHead(500, { 'Content-Type': 'application/json' });


    return res.end(JSON.stringify({


      error: 'Authentication not configured',


      message: 'AZURE_AD_TENANT_ID and AZURE_AD_CLIENT_ID must be set',


    }));


  }





  // Extract token from Authorization header


  const authHeader = req.headers['authorization'];


  if (!authHeader) {


    res.writeHead(401, { 'Content-Type': 'application/json' });


    return res.end(JSON.stringify({


      error: 'Unauthorized',


      message: 'No authorization header provided',


    }));


  }





  const parts = authHeader.split(' ');


  if (parts.length !== 2 || parts[0] !== 'Bearer') {


    res.writeHead(401, { 'Content-Type': 'application/json' });


    return res.end(JSON.stringify({


      error: 'Unauthorized',


      message: 'Invalid authorization header format. Expected: Bearer <token>',


    }));


  }





  const token = parts[1];





  try {


    // Verify and decode the token


    const decoded = await verifyToken(token);





    // Attach user information to request


    req.user = {


      oid: decoded.oid, // Object ID (unique user identifier)


      email: decoded.email || decoded.preferred_username || decoded.upn,


      name: decoded.name,


      roles: decoded.roles || [],


      isAuthenticated: true,


      tokenPayload: decoded, // Full token payload for advanced use cases


    };





    console.log(`[Auth] User authenticated: ${req.user.email}`);


    next();


  } catch (error) {


    console.error('[Auth] Token verification failed:', error.message);


    


    // Provide specific error messages


    if (error.name === 'TokenExpiredError') {


      res.writeHead(401, { 'Content-Type': 'application/json' });


      return res.end(JSON.stringify({


        error: 'Token Expired',


        message: 'Your session has expired. Please log in again.',


      }));


    }


    


    if (error.name === 'JsonWebTokenError') {


      res.writeHead(401, { 'Content-Type': 'application/json' });


      return res.end(JSON.stringify({


        error: 'Invalid Token',


        message: 'The provided token is invalid.',


      }));


    }





    res.writeHead(401, { 'Content-Type': 'application/json' });


    return res.end(JSON.stringify({


      error: 'Unauthorized',


      message: 'Authentication failed',


    }));


  }


}





/**


 * Optional Authentication Middleware


 * Attaches user info if token is valid, but doesn't block the request


 */


async function optionalAuth(req, res, next) {


  const config = getConfig();


  


  if (!config.AUTH_ENABLED) {


    console.log('[Auth] Optional authentication bypassed (AUTH_ENABLED=false)');


    req.user = {


      oid: 'local-dev-user',


      email: 'dev@localhost',


      name: 'Local Development User',


      isAuthenticated: false,


    };


    return next();


  }





  const authHeader = req.headers['authorization'];


  if (!authHeader) {


    req.user = null;


    return next();


  }





  try {


    const token = authHeader.split(' ')[1];


    const decoded = await verifyToken(token);


    req.user = {


      oid: decoded.oid,


      email: decoded.email || decoded.preferred_username,


      name: decoded.name,


      roles: decoded.roles || [],


      isAuthenticated: true,


    };


  } catch (error) {


    console.log(`[Auth] Optional authentication failed: ${error.message}`);


    req.user = null;


  }





  next();


}





/**


 * Role-based Authorization Middleware


 * Usage: requireRole('Admin', 'PowerUser') or requireRole(['Admin', 'PowerUser'])


 */


function requireRole(...allowedRoles) {


  // Support both requireRole('Admin', 'PowerUser') and requireRole(['Admin', 'PowerUser'])


  if (allowedRoles.length === 1 && Array.isArray(allowedRoles[0])) {


    allowedRoles = allowedRoles[0];


  }


  


  return (req, res, next) => {


    const config = getConfig();


    


    // Bypass role check if authentication is disabled


    if (!config.AUTH_ENABLED) {


      console.log('[Auth] Role check bypassed (AUTH_ENABLED=false)');


      return next();


    }


    


    if (!req.user || !req.user.isAuthenticated) {


      res.writeHead(401, { 'Content-Type': 'application/json' });


      return res.end(JSON.stringify({


        error: 'Unauthorized',


        message: 'Authentication required',


      }));


    }





    const userRoles = req.user.roles || [];


    const hasRole = allowedRoles.some((role) => userRoles.includes(role));





    if (!hasRole) {


      console.log(`[Auth] Role check failed for ${req.user.email}: required [${allowedRoles.join(', ')}], user has [${userRoles.join(', ')}]`);


      res.writeHead(403, { 'Content-Type': 'application/json' });


      return res.end(JSON.stringify({


        error: 'Forbidden',


        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,


        requiredRoles: allowedRoles,


        userRoles: userRoles,


      }));


    }


    


    console.log(`[Auth] Role check passed for ${req.user.email}`);


    next();


  };


}





module.exports = {


  authenticateToken,


  optionalAuth,


  requireRole,


};