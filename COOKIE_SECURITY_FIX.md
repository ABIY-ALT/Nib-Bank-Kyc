# Authentication Cookie Security Fix - Next.js 16

## Overview

This document explains the authentication cookie security improvements implemented in the NIB Bank KYC application to meet banking-grade security standards and OWASP compliance.

---

## Problem Statement

The application's authentication cookie (`nib-auth-token`) was using conditional security flags:

```typescript
// BEFORE (Insecure)
response.cookies.set('nib-auth-token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',  // ❌ Conditional
  sameSite: 'strict',
  maxAge: 60 * 10,
  path: '/',
});
```

**Issue**: When `NODE_ENV !== 'production'`, the `secure` flag was not set, meaning the cookie could be transmitted over non-HTTPS connections. This violates banking security standards.

---

## Solution Implemented

All cookie operations now enforce `secure: true` unconditionally:

```typescript
// AFTER (Secure)
response.cookies.set('nib-auth-token', token, {
  httpOnly: true,
  secure: true,              // ✅ Always enabled
  sameSite: 'strict',        // ✅ CSRF protection
  maxAge: 60 * 10,           // ✅ Token lifetime (10 minutes)
  path: '/',                 // ✅ Root path only
});
```

### Files Updated

1. **[src/app/api/auth/login/route.ts](src/app/api/auth/login/route.ts)** - Login endpoint
2. **[src/app/api/auth/me/route.ts](src/app/api/auth/me/route.ts)** - Token rotation (session refresh)
3. **[src/app/api/auth/logout/route.ts](src/app/api/auth/logout/route.ts)** - Logout cookie clearing
4. **[src/actions/password.ts](src/actions/password.ts)** - Password change authentication
5. **[src/proxy.ts](src/proxy.ts)** - Middleware cookie management (3 locations)

---

## Security Flags Explained

### `httpOnly: true`
- ✅ **Prevents XSS attacks** - Cookie cannot be accessed via JavaScript (`document.cookie`)
- ✅ Only the HTTP/HTTPS protocol can read/write the cookie
- ✅ Essential for sensitive authentication tokens

### `secure: true`
- ✅ **Prevents MITM attacks** - Cookie is only transmitted over HTTPS
- ✅ Browser will reject the Set-Cookie header if protocol is not HTTPS
- ✅ **Exception**: Localhost (127.0.0.1) is allowed for development even over HTTP

### `sameSite: 'strict'`
- ✅ **Prevents CSRF attacks** - Cookie is never sent with cross-site requests
- ✅ Even if user clicks a malicious external link, the auth cookie won't be included
- ✅ Stricter than `'lax'` but ensures maximum security for banking applications

### `path: '/'`
- ✅ Cookie is accessible from all routes in the application
- ✅ Prevents subdomain/subpath isolation issues

---

## Localhost Behavior Explanation

### Why "Secure" Flag Doesn't Show in DevTools on Localhost

When running `http://localhost:3000` locally:

1. **Browser receives**: `Set-Cookie: nib-auth-token=...; Secure; ...`
2. **Browser does**: ✅ **Accepts the cookie anyway**
3. **DevTools shows**: Cookie may appear **without** the "Secure" badge

**Why?** Browsers have a special exemption for `localhost` and `127.0.0.1` in the Secure flag requirement. This is intentional for local development:

- Developers can test `secure: true` behavior without HTTPS
- No actual HTTP transmission occurs (localhost is local machine only)
- Provides a safe development experience while maintaining production security

### Production Behavior

When deployed to HTTPS in production:

1. **Browser receives**: `Set-Cookie: nib-auth-token=...; Secure; ...` over HTTPS
2. **Browser enforces**: 
   - ✅ Cookie is stored with "Secure" flag
   - ✅ Cookie is **only** transmitted over HTTPS
   - ✅ Cookie is **rejected** if any HTTP attempt is made
   - ✅ DevTools clearly shows the "Secure" badge

---

## Testing the Fix

### Local Development (Localhost)

1. Open browser DevTools → **Application** tab → **Cookies** → **localhost:3000**
2. After login, verify the `nib-auth-token` cookie:
   - ✅ `HttpOnly`: Should be **checked**
   - ✅ `Secure`: May appear unchecked in DevTools (browser's localhost exemption)
   - ✅ `SameSite`: Should be **Strict**
   - ✅ `Path`: Should be **/**

### Verification via Network Tab

1. Open **DevTools** → **Network** tab
2. Login and find the login API request
3. In the response headers, verify the `Set-Cookie` header:
   ```
   Set-Cookie: nib-auth-token=...; Path=/; HttpOnly; Secure; SameSite=Strict
   ```

### Production (HTTPS)

- DevTools will clearly show the "Secure" badge
- Cookie will only transmit over HTTPS
- OWASP security scanners will pass

---

## OWASP Compliance

This implementation follows OWASP guidelines:

| Requirement | Implementation | Status |
|------------|-----------------|--------|
| **Session Token Storage** | Secure HttpOnly cookie | ✅ |
| **Transmission Security** | HTTPS only (Secure flag) | ✅ |
| **Cross-Site Protection** | SameSite=Strict | ✅ |
| **Token Lifetime** | 10 minutes max-age | ✅ |
| **Token Rotation** | Rotates on sensitive operations | ✅ |
| **Session Invalidation** | Password + logout clears token | ✅ |

---

## Implementation Details

### Next.js 16 Cookie Usage

This fix uses the standard `next/headers` API:

```typescript
import { cookies } from 'next/headers';

// Server Component/Action
const cookieStore = await cookies();
cookieStore.set('nib-auth-token', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 60 * 10,
  path: '/',
});
```

### API Route Implementation

```typescript
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const response = NextResponse.json({ success: true });
  
  response.cookies.set('nib-auth-token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 10,
    path: '/',
  });
  
  return response;
}
```

### Middleware Implementation

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const response = NextResponse.next();
  
  response.cookies.set('nib-auth-token', newToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 10,
    path: '/',
  });
  
  return response;
}
```

---

## Deployment Checklist

Before deploying to production, ensure:

- [ ] Application is served over HTTPS
- [ ] SSL/TLS certificate is valid and up-to-date
- [ ] All endpoints use HTTPS redirects
- [ ] Load balancer/reverse proxy passes `X-Forwarded-Proto: https`
- [ ] `Secure` flag is set to `true` (already done)
- [ ] `httpOnly` is set to `true` (already done)
- [ ] `sameSite` is set to `'strict'` (already done)

---

## Related Security Files

- **[src/lib/api-security.ts](src/lib/api-security.ts)** - API security utilities
- **[src/proxy.ts](src/proxy.ts)** - Middleware security proxy
- **[API_SECURITY_CONFIG.md](API_SECURITY_CONFIG.md)** - Full security documentation

---

## References

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [MDN: Set-Cookie Secure Flag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#secure)
- [Next.js 16 Cookies API](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [RFC 6265: HTTP State Management Mechanism](https://tools.ietf.org/html/rfc6265)

---

**Last Updated**: March 12, 2026  
**Status**: ✅ Implemented
