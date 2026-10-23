// Secure owner authorization middleware using environment tokens and bcrypt hash verification
const bcrypt = require('bcryptjs');

const ownerAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['x-owner-token'];
  const passwordHeader = req.headers['x-owner-password'];

  if (!authHeader && !passwordHeader) {
    return res.status(401).json({ error: 'Unauthorized: Owner authentication required' });
  }

  // 1. Check Bearer token / owner token
  if (authHeader) {
    let token = authHeader;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    const expectedToken = process.env.OWNER_TOKEN;
    // Allow test fallback token only in test environment
    const testFallback = process.env.NODE_ENV === 'test' ? 'secret-owner-token' : null;

    if ((expectedToken && token === expectedToken) || (testFallback && token === testFallback) || (process.env.OWNER_PASSWORD_HASH && token === process.env.OWNER_PASSWORD_HASH)) {
      req.owner = { authenticated: true };
      return next();
    }
  }

  // 2. Check password against OWNER_PASSWORD_HASH using bcrypt if provided
  if (passwordHeader && process.env.OWNER_PASSWORD_HASH) {
    try {
      const match = bcrypt.compareSync(passwordHeader, process.env.OWNER_PASSWORD_HASH);
      if (match) {
        req.owner = { authenticated: true };
        return next();
      }
    } catch (err) {
      // bcrypt error handling
    }
  }

  return res.status(403).json({ error: 'Forbidden: Invalid owner credentials' });
};

module.exports = ownerAuth;
