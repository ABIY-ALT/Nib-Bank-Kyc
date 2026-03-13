# CORS Security - Quick Reference

## 🚀 Quick Setup (5 minutes)

### 1. Configure Environment
```env
# .env.local or .env.production
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
CREDENTIAL_SHARING=false
ENABLE_CORS_LOGGING=false
```

### 2. Update Your API Routes
```typescript
// before
export async function POST(request: NextRequest) {
  return NextResponse.json({ success: true });
}

// after
import { corsMiddleware } from '@/lib/cors-security';

export async function POST(request: NextRequest) {
  return corsMiddleware(request, async () => {
    return NextResponse.json({ success: true });
  });
}
```

### 3. Verify It Works
```bash
# Test from allowed origin
curl -X POST https://yourdomain.com/api/endpoint \
  -H "Origin: https://app.yourdomain.com" \
  -H "Content-Type: application/json" \
  -d '{"data":"test"}'

# Should return:
# - 200 OK
# - Header: Access-Control-Allow-Origin: https://app.yourdomain.com
```

---

## ✅ Checklist

- [ ] Copy `.env.cors.example` to `.env.local`
- [ ] Set `ALLOWED_ORIGINS=your,trusted,domains`
- [ ] Wrap API routes with `corsMiddleware()`
- [ ] Test with curl/Postman
- [ ] Run `/api/debug/cors` endpoint
- [ ] Deploy to production
- [ ] Run OWASP ZAP scan

---

## 📋 API Patterns

### Public Endpoint
```typescript
import { corsMiddleware } from '@/lib/cors-security';

export async function POST(request: NextRequest) {
  return corsMiddleware(request, async () => {
    const body = await request.json();
    // Process...
    return NextResponse.json({ success: true });
  });
}
```

### Protected Endpoint
```typescript
import { corsMiddleware } from '@/lib/cors-security';

export async function GET(request: NextRequest) {
  return corsMiddleware(request, async () => {
    // Check auth
    const token = request.cookies.get('nib-auth-token')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    return NextResponse.json({ data: [] });
  });
}
```

### State-Changing (POST/PUT/DELETE)
```typescript
export async function DELETE(request: NextRequest) {
  return corsMiddleware(request, async () => {
    // Auth check
    // Validate origin (done by corsMiddleware automatically)
    // Delete...
    return NextResponse.json({ success: true });
  });
}
```

---

## 🔍 Testing

### Test CORS Configuration
```bash
# Full diagnostic report
curl http://localhost:3000/api/debug/cors | jq

# Test specific origin
curl -X POST http://localhost:3000/api/debug/cors \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "https://yourdomain.com",
    "method": "POST",
    "headers": "Content-Type"
  }' | jq
```

### Manual Tests

```bash
# 1. Same-origin (should work)
curl -X GET http://localhost:3000/api/endpoint

# 2. Allowed origin (should work + CORS headers)
curl -X POST http://localhost:3000/api/endpoint \
  -H "Origin: https://app.yourdomain.com"

# 3. Untrusted origin (should fail 403)
curl -X POST http://localhost:3000/api/endpoint \
  -H "Origin: https://evil.com"

# 4. Wildcard origin (should always fail)
curl -X POST http://localhost:3000/api/endpoint \
  -H "Origin: *"

# 5. Preflight (should return 204)
curl -X OPTIONS http://localhost:3000/api/endpoint \
  -H "Origin: https://app.yourdomain.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"
```

---

## ⚙️ Configuration Options

| Variable | Value | Purpose |
|----------|-------|---------|
| `ALLOWED_ORIGINS` | `https://domain1.com,https://domain2.com` | Whitelist trusted domains |
| `CREDENTIAL_SHARING` | `true/false` | Allow cookies with CORS requests |
| `ENABLE_CORS_LOGGING` | `true/false` | Debug logging (development only) |
| `CORS_MAX_AGE` | `7200` | Preflight cache seconds |
| `SECURE_COOKIE_SAME_SITE` | `Strict/Lax/None` | Cookie security |

---

## 🚫 What's Blocked

❌ **Wildcard origins** (`Access-Control-Allow-Origin: *`)
❌ **Unknown origins** (not in ALLOWED_ORIGINS)
❌ **Extra HTTP methods** (only GET, POST, PUT, DELETE)
❌ **Extra headers** (only Content-Type, Authorization)
❌ **Credentials without origins** (dangerously open)
❌ **Invalid origin formats**

---

## ✨ What's Enabled

✅ **Trusted domains only** (whitelisted explicitly)
✅ **Secure credential handling** (SameSite=Strict)
✅ **Strict security headers** (HSTS, CSP, X-Frame-Options)
✅ **Proper preflight handling** (OPTIONS method)
✅ **Origin validation** (before processing requests)
✅ **Detailed logging** (in development mode)
✅ **Diagnostic endpoint** (`/api/debug/cors`)

---

## 🐛 Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "CORS policy: No '*' in Access-Control-Allow-Origin" | Domain not whitelisted | Add to ALLOWED_ORIGINS |
| Preflight returns 403 | Origin not in whitelist | Check ALLOWED_ORIGINS |
| Cookie not sent | CREDENTIAL_SHARING=false | Set to true if needed + add origin |
| Custom header blocked | Header not in allowlist | Edit corsMiddleware allowedHeaders |
| Works in dev, fails in prod | Empty ALLOWED_ORIGINS | Set in production env vars |

---

## 📚 Files Reference

| File | Purpose |
|------|---------|
| `src/lib/cors-security.ts` | Core CORS validation utility |
| `src/middleware.ts` | Next.js middleware for all routes |
| `src/lib/cors-testing.ts` | Security test suite |
| `src/app/api/debug/cors/route.ts` | Diagnostic endpoint (dev only) |
| `.env.cors.example` | Environment template |
| `CORS_SECURITY_IMPLEMENTATION.md` | Full implementation guide |

---

## 🔒 Security Headers Automatically Applied

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Access-Control-Allow-Origin: [validated origin only]
```

---

## 📞 Support

**Full Documentation**: See `CORS_SECURITY_IMPLEMENTATION.md`
**Testing**: Run `curl http://localhost:3000/api/debug/cors`
**Issues**: Check repo memory files for known patterns
