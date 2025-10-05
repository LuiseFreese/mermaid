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


const AZURE_AD_TENANT_ID = process.env.AZURE_AD_TENANT_ID;


const AZURE_AD_CLIENT_ID = process.env.AZURE_AD_CLIENT_ID;


const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';





// JWKS client to fetch Azure AD signing keys


const client = jwksClient({


  jwksUri: `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}/discovery/v2.0/keys`,


  cache: true,


  cacheMaxAge: 86400000, // 24 hours


  rateLimit: true,


  jwksRequestsPerMinute: 10,


});





/**


 * Get the signing key from Azure AD


 */


function getKey(header, callback) {


  client.getSigningKey(header.kid, (err, key) => {


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


    jwt.verify(


      token,


      getKey,


      {


        audience: AZURE_AD_CLIENT_ID, // Must match the client ID


        issuer: `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}/v2.0`, // Must match tenant


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


  // Bypass authentication if disabled (local development)


  if (!AUTH_ENABLED) {


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


  if (!AZURE_AD_TENANT_ID || !AZURE_AD_CLIENT_ID) {


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


  if (!AUTH_ENABLED) {


    req.user = null;


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


    req.user = null;


  }





  next();


}





/**


 * Role-based Authorization Middleware


 * Usage: requireRole('Admin', 'PowerUser')


 */


function requireRole(...allowedRoles) {


  return (req, res, next) => {


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


      res.writeHead(403, { 'Content-Type': 'application/json' });


      return res.end(JSON.stringify({


        error: 'Forbidden',


        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,


      }));


    }





    next();


  };


}





module.exports = {


  authenticateToken,


  optionalAuth,


  requireRole,


};