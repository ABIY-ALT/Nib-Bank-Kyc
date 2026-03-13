# API Security Configuration Guide

## Overview
This document describes the security measures implemented for authenticated access control, IP whitelisting, and CORS protection.

## Environment Variables

### Authentication & JWT
```env
# JWT secret for signing and verifying authentication tokens
# REQUIRED: Must be at least 32 characters
JWT_SECRET=your-secure-secret-key-min-32-chars-long

# Session configuration
NODE_ENV=production  # Set to 'production' for strict HTTPS cookie security
```

### IP Whitelisting for Sensitive Operations
```env
# IP addresses allowed to perform sensitive operations (like password verification)
# Format: comma-separated list of IPv4 addresses or CIDR ranges
# If not set, all authenticated users are allowed
# Examples:
#   SENSITIVE_OPERATIONS_IP_WHITELIST=192.168.1.0/24,10.0.0.1
#   SENSITIVE_OPERATIONS_IP_WHITELIST=192.168.1.1,192.168.1.2
SENSITIVE_OPERATIONS_IP_WHITELIST=

# For local development (allows localhost):
# SENSITIVE_OPERATIONS_IP_WHITELIST=127.0.0.1,::1
```

### CORS Configuration
```env
# Allowed origins for CORS requests
# IMPORTANT: Leave EMPTY to disable CORS entirely (recommended)
# Only specify origins if your application requires cross-origin requests
# Format: comma-separated list of origins
# Example: ALLOWED_ORIGINS=https://example.com,https://app.example.com
ALLOWED_ORIGINS=
```

## Security Features

### 1. Authentication Enforcement
✅ All API endpoints checking `/api/auth`, `/api/memos` require valid JWT token
✅ Session validation includes:
   - Token signature verification
   - Absolute lifetime enforcement (8 hours)
   - Token version validation (invalidated on password change)
   - Client context binding (IP + User Agent hash)

### 2. IP Whitelisting
✅ Sensitive operations (e.g., password verification) can be restricted to specific IPs
✅ Supports both individual IPs and CIDR ranges (e.g., 192.168.1.0/24)
✅ Automatic IP extraction from:
   - X-Forwarded-For header (for proxied connections)
   - X-Real-IP header
   - CF-Connecting-IP header (Cloudflare)

### 3. CORS Protection
✅ NO CORS headers set by default (Same Origin Policy enforced)
✅ All CORS headers are explicitly removed from API responses
✅ CSRF protection via strict origin validation for state-changing requests
✅ Optional: Can enable for specific trusted origins via ALLOWED_ORIGINS

### 4. Security Headers Applied to All API Responses
```
X-Content-Type-Options: nosniff              # Prevent MIME sniffing
X-Frame-Options: DENY                        # Disable framing
X-XSS-Protection: 1; mode=block             # XSS protection
Strict-Transport-Security: (1 year max-age) # Force HTTPS
Content-Security-Policy: default-src 'self' # Restrict resource loading
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: (disable all features)
```

## API Endpoints Security

### Public Endpoints (No Auth Required)
- `POST /api/auth/login` - Authentication only, no CORS

### Protected Endpoints (Auth Required)
- `GET /api/auth/me` - Session validation + client context binding
- `POST /api/auth/logout` - Requires valid session
- `POST /api/auth/verify-password` - Requires valid session + IP whitelist check
- `GET /api/memos/[token]` - Requires valid session

## Configuration Examples

### Local Development
```env
JWT_SECRET=dev-secret-key-must-be-at-least-32-characters-long-xxx
NODE_ENV=development
SENSITIVE_OPERATIONS_IP_WHITELIST=127.0.0.1
ALLOWED_ORIGINS=http://localhost:3000
```

### Production (Bank/Enterprise)
```env
JWT_SECRET=$(openssl rand -base64 32)
NODE_ENV=production
# Restrict password operations to internal IP ranges
SENSITIVE_OPERATIONS_IP_WHITELIST=192.168.1.0/24,10.0.0.0/8
# No CORS - Same Origin Policy only
ALLOWED_ORIGINS=
```

### Staging with Multiple Domains
```env
JWT_SECRET=$(openssl rand -base64 32)
NODE_ENV=production
SENSITIVE_OPERATIONS_IP_WHITELIST=10.0.0.0/8
# Only allow explicit trusted domains
ALLOWED_ORIGINS=https://staging.example.com,https://app-staging.example.com
```

## Implementation Details

### Authentication Flow
1. User logs in via `POST /api/auth/login`
2. Server returns JWT token in secure, httpOnly, SameSite=Strict cookie
3. All subsequent requests validated via `verifyAuthentication()`
4. Client context (IP + User Agent) bound to token
5. Session auto-refreshes every 2 minutes (rotation)

### Sensitive Operation Protection
1. Endpoint requires authentication via `verifyAuthentication()`
2. Client IP validated against whitelist via `verifyIpWhitelist()`
3. If whitelist configured and IP not allowed → 403 Forbidden
4. Audit logged for all attempts

### CORS Handling
1. By default, no CORS headers in responses
2. Browser Same Origin Policy enforced automatically
3. State-changing requests (POST/PUT/DELETE) have strict origin validation
4. If ALLOWED_ORIGINS configured, only listed origins receive explicit CORS headers

## Testing & Verification

### Check Authentication
```bash
# Should fail - no auth
curl https://your-domain/api/auth/me

# Should succeed - with auth cookie
curl -b "nib-auth-token=YOUR_TOKEN" https://your-domain/api/auth/me
```

### Test IP Whitelist
```bash
# From allowed IP
curl -H "X-Forwarded-For: 192.168.1.1" \
  -b "nib-auth-token=YOUR_TOKEN" \
  https://your-domain/api/auth/verify-password

# From restricted IP (should fail with 403)
curl -H "X-Forwarded-For: 1.2.3.4" \
  -b "nib-auth-token=YOUR_TOKEN" \
  https://your-domain/api/auth/verify-password
```

### Verify CORS Headers Removed
```bash
curl -i https://your-domain/api/auth/me
# Check response - should have NO "Access-Control-Allow-Origin" header
```

## Security Checklist

- [ ] JWT_SECRET is set to a strong, random 32+ character value
- [ ] NODE_ENV is set to 'production' in production
- [ ] SENSITIVE_OPERATIONS_IP_WHITELIST configured for sensitive operations
- [ ] ALLOWED_ORIGINS is empty (unless cross-origin requests needed)
- [ ] All API endpoints in the application use security utilities
- [ ] HTTPS enforced (Strict-Transport-Security header)
- [ ] Cookies have httpOnly and Secure flags set
- [ ] Security headers are present in all API responses
- [ ] Rate limiting is enabled on authentication endpoints
- [ ] Audit logging captures all sensitive operations

## References

- OWASP: https://owasp.org/www-community/attacks/csrf
- MDN CORS: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
- JWT Best Practices: https://tools.ietf.org/html/rfc8725
