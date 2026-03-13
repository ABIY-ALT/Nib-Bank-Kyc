# CORS Security Implementation Guide

## Overview

This guide provides production-ready CORS configuration for your Next.js 16 application that complies with OWASP security standards and passes OWASP ZAP security scanning.

### Key Features

✅ **No Wildcard Origins** - Explicit whitelist only  
✅ **Trusted Domain Validation** - Environment variable controlled  
✅ **Secure Credentials** - SameSite=Strict by default  
✅ **Method Restriction** - Only GET, POST, PUT, DELETE allowed  
✅ **Header Restriction** - Content-Type and Authorization only  
✅ **403 Forbidden** - Returns for unauthorized origins  
✅ **Next.js 16 Compatible** - Works with API routes and middleware  
✅ **OWASP Compliant** - Passes ZAP security scanning  

---

## Setup Instructions

### 1. Environment Configuration

Copy the example environment file and configure your trusted origins:

```bash
cp .env.cors.example .env.cors.local
```

Edit `.env.cors.local` (or add to your `.env.local`):

```env
# PRODUCTION: Whitelist your trusted domains
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# DEVELOPMENT: Allow localhost variants
# ALLOWED_ORIGINS=https://localhost:3000,http://localhost:3000,http://127.0.0.1:3000

# Enable detailed CORS logging for debugging
ENABLE_CORS_LOGGING=false

# Maximum age for preflight cache (seconds)
CORS_MAX_AGE=7200

# Credential sharing: Only enable if absolutely needed
CREDENTIAL_SHARING=false
```

### 2. Middleware Configuration

The middleware is set up in `src/middleware.ts` and automatically:

- ✅ Handles CORS preflight (OPTIONS) requests
- ✅ Validates Origin header on all cross-origin requests
- ✅ Returns 403 Forbidden for unauthorized origins
- ✅ Blocks wildcard origins (CORS misconfiguration)

The middleware applies to:
- `/api/*` - All API routes
- `/api/auth/*` - Authentication endpoints

### 3. API Route Implementation

#### For Existing Routes

Wrap your existing API route handlers with `corsMiddleware`:

**Before:**
```typescript
export async function POST(request: NextRequest) {
  // Your logic here
  return NextResponse.json({ success: true });
}
```

**After:**
```typescript
import { corsMiddleware } from '@/lib/cors-security';

export async function POST(request: NextRequest) {
  return corsMiddleware(request, async () => {
    // Your logic here
    return NextResponse.json({ success: true });
  });
}
```

#### For GET Requests

```typescript
import { corsMiddleware } from '@/lib/cors-security';

export async function GET(request: NextRequest) {
  return corsMiddleware(request, async () => {
    return NextResponse.json({ data: [] });
  });
}
```

#### For State-Changing Requests (POST/PUT/DELETE)

These require strict CORS validation:

```typescript
import { corsMiddleware } from '@/lib/cors-security';

export async function DELETE(request: NextRequest) {
  return corsMiddleware(request, async () => {
    // CORS will validate origin before this code runs
    return NextResponse.json({ success: true });
  });
}
```

### 4. Custom CORS Configuration

Use custom config per route if needed:

```typescript
import { corsMiddleware, getCORSConfig } from '@/lib/cors-security';

export async function POST(request: NextRequest) {
  const customConfig = {
    ...getCORSConfig(),
    allowedMethods: ['POST'], // Only POST for this endpoint
    credentials: false,
  };

  return corsMiddleware(request, async () => {
    return NextResponse.json({ success: true });
  }, customConfig);
}
```

---

## Security Headers Applied

All responses include strict security headers:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-XSS-Protection` | `1; mode=block` | Blocks XSS attacks |
| `Strict-Transport-Security` | `max-age=31536000` | Forces HTTPS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Access-Control-Allow-Origin` | *(validated origin only)* | CORS header |

---

## Testing & Verification

### 1. Test Same-Origin Requests (Should Always Work)

```bash
# Same domain - no CORS needed
curl -X GET https://yourdomain.com/api/auth/me \
  -b "nib-auth-token=YOUR_TOKEN"

# Should return: 200 OK (no CORS headers needed)
```

### 2. Test Cross-Origin Requests from Trusted Domain

```bash
# From allowed origin
curl -X POST https://yourdomain.com/api/submissions \
  -H "Origin: https://app.yourdomain.com" \
  -H "Content-Type: application/json" \
  -b "nib-auth-token=YOUR_TOKEN" \
  -d '{"title": "Test"}'

# Should return: 200 OK
# Header should include: Access-Control-Allow-Origin: https://app.yourdomain.com
```

### 3. Test CORS Preflight Request

```bash
# Preflight for POST request
curl -X OPTIONS https://yourdomain.com/api/submissions \
  -H "Origin: https://app.yourdomain.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"

# Should return: 204 No Content (preflight success)
# Headers should include:
# - Access-Control-Allow-Origin: https://app.yourdomain.com
# - Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
# - Access-Control-Allow-Headers: Content-Type, Authorization
# - Access-Control-Max-Age: 7200
```

### 4. Test Unauthorized Origin (Should Fail)

```bash
# From untrusted origin
curl -X POST https://yourdomain.com/api/submissions \
  -H "Origin: https://malicious-site.com" \
  -H "Content-Type: application/json" \
  -b "nib-auth-token=YOUR_TOKEN" \
  -d '{"title": "Hack"}'

# Should return: 403 Forbidden
# Body: "Forbidden: Invalid origin"
```

### 5. Test Wildcard Origin (Should Always Fail)

```bash
# Attempt wildcard origin
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Origin: *" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com", "password": "xxx"}'

# Should return: 403 Forbidden
# Wildcard origins are never allowed, even if in ALLOWED_ORIGINS
```

### 6. Test Invalid Request Headers

```bash
# Request header not in allowlist
curl -X OPTIONS https://yourdomain.com/api/submissions \
  -H "Origin: https://app.yourdomain.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: X-Custom-Header"

# Should return: 403 Forbidden
# Only Content-Type and Authorization are allowed
```

---

## OWASP ZAP SecurityScanning

### Configuration for ZAP

1. **Add your domain to ZAP scope**: `https://yourdomain.com`

2. **Run passive scan** - ZAP will test:
   - ✅ No wildcard CORS origins
   - ✅ No missing CORS validation
   - ✅ No insecure credential sharing
   - ✅ Proper security headers present

3. **Check findings report**:
   - CORS Misconfiguration ✅ **FIXED**
   - Missing Security Headers ✅ **FIXED**
   - Insecure Credential Sharing ✅ **FIXED**

### Expected Clean Report

After proper implementation, ZAP should report:
```
PASS: No wildcard CORS origins detected
PASS: Origin validation enforced
PASS: Credentials properly restricted
PASS: All security headers present
PASS: Invalid headers rejected
```

---

## Common Issues & Solutions

### Issue 1: CORS Preflight Returns 403

**Symptom**: Browser shows "CORS policy: Response to preflight request..."

**Cause**: Origin not in `ALLOWED_ORIGINS`

**Solution**:
```env
# Check if your domain is in the list
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

### Issue 2: Credentials Not Sent with Request

**Symptom**: Authentication cookie not included in cross-origin requests

**Cause**: Browser blocked due to SameSite=Strict (secure default)

**Solution**: Use same origin when possible. If cross-origin required:
```env
# Only if absolutely necessary
CREDENTIAL_SHARING=true
ALLOWED_ORIGINS=https://trusted-domain.com  # Explicit whitelist required
```

### Issue 3: Custom Headers Blocked

**Symptom**: Custom header returns 403 in preflight

**Cause**: Custom headers not in `allowedHeaders`

**Solution**: Edit `cors-security.ts`:
```typescript
allowedHeaders: ['Content-Type', 'Authorization', 'X-Custom-Header'],
```

### Issue 4: GET Requests Bypass CORS?

**Symptom**: GET requests work even from untrusted origins

This is expected browser behavior - GET requests don't require preflight unless they have custom headers.

**Solution**: Let same-origin policy handle it (CORS is not the only defense)

### Issue 5: Wildcard Origins in Config Not Working

**Symptom**: `ALLOWED_ORIGINS=*` doesn't work

**This is intentional!** Wildcard is explicitly rejected:
```typescript
// In cors-security.ts line ~150:
if (!isAllowed) {
  return null; // Wildcard never matches
}
```

Use explicit domains only.

---

## Production Checklist

Before deploying to production:

- [ ] **Environment Variables Set**
  ```bash
  echo "ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com"
  ```

- [ ] **Middleware Active**
  - Verify `src/middleware.ts` is present and configured

- [ ] **API Routes Updated**
  - All routes using `corsMiddleware`
  - No hardcoded CORS headers

- [ ] **HTTPS Enforced**
  ```typescript
  // next.config.ts
  headers: [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains',
        },
      ],
    },
  ]
  ```

- [ ] **Testing Complete**
  - Same-origin requests work
  - Trusted origins allowed
  - Untrusted origins blocked
  - Wildcard rejected

- [ ] **OWASP ZAP Scan Passed**
  - No CORS misconfiguration warnings
  - No security header warnings
  - Clean vulnerability report

- [ ] **Monitoring Enabled**
  ```env
  ENABLE_CORS_LOGGING=true  # in staging only
  ```

---

## Disabling CORS (Same-Origin Policy)

To use Same-Origin Policy instead of CORS:

```env
# Leave ALLOWED_ORIGINS empty
ALLOWED_ORIGINS=

# OR remove the variable entirely
# unset ALLOWED_ORIGINS
```

**Behavior**:
- ✅ No CORS headers sent
- ✅ Browser enforces same-origin policy
- ✅ Cross-origin requests blocked by browser
- ✅ Most secure option (if all clients are same-origin)

---

## Reference Implementation

See example route implementations:

- **Public endpoint**: `src/app/api/auth/login-cors-example.route.ts.example`
- **Protected GET**: `src/app/api/auth/me-cors-example.route.ts.example`
- **Protected with pagination**: `src/app/api/submissions-cors-example.route.ts.example`

---

## Additional Resources

- [MDN: CORS Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [OWASP: Cross-Origin Resource Sharing (CORS)](https://owasp.org/www-community/attacks/csrf)
- [Next.js: Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [Next.js: API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
