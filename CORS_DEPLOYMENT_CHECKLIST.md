# CORS Security - Production Deployment Checklist

**Application**: Nib Bank KYC  
**Date**: March 12, 2026  
**CORS Version**: 2.0 - Production Ready  

---

## ✋ Pre-Deployment Review

### Code Changes
- [ ] `src/lib/cors-security.ts` created
- [ ] `src/middleware.ts` created with CORS logic
- [ ] `src/lib/cors-testing.ts` created
- [ ] API routes wrapped with `corsMiddleware()`
- [ ] No hardcoded CORS headers in code
- [ ] No wildcard origins in codebase

### Configuration
- [ ] Environment variables ready:
  - [ ] `ALLOWED_ORIGINS` set to production domains
  - [ ] `CREDENTIAL_SHARING` determined (typically false)
  - [ ] `ENABLE_CORS_LOGGING` set to false
  - [ ] `NODE_ENV=production`
- [ ] No test/dev domains in production config
- [ ] All secrets in secure environment (not code)

### Documentation
- [ ] `CORS_SECURITY_IMPLEMENTATION.md` reviewed
- [ ] `CORS_QUICK_REFERENCE.md` shared with team
- [ ] Runbook created for support team
- [ ] API documentation updated

---

## 🚀 Deployment Steps

### 1. Build & Test (Local)

```bash
# Clean build
npm run build

# No errors expected
# Type checking passes
# No warnings about CORS

# Run local tests
npm run dev
curl http://localhost:3000/api/debug/cors
# Review output for any issues
```

**Status**: _____ (Date: _____)

### 2. Deploy to Staging

```bash
# Deploy to staging environment
vercel deploy --prod --target staging

# Verify staging environment
curl https://staging.yourdomain.com/api/debug/cors

# Check in browser console (Network tab)
curl -X POST https://staging.yourdomain.com/api/auth/login \
  -H "Origin: https://staging.yourdomain.com" \
  -H "Content-Type: application/json"

# Response headers should show:
# Access-Control-Allow-Origin: https://staging.yourdomain.com
```

**Status**: _____ (Date: _____)

### 3. Security Testing - Staging

```bash
# Test 1: Whitelist validation
curl -X POST https://staging.yourdomain.com/api/auth/login \
  -H "Origin: https://app.yourdomain.com"
# Expected: 403 Forbidden (blocked) or 200 with CORS headers

# Test 2: Wildcard rejection
curl -X POST https://staging.yourdomain.com/api/auth/login \
  -H "Origin: *"
# Expected: 403 Forbidden (always)

# Test 3: Untrusted origin
curl -X POST https://staging.yourdomain.com/api/auth/login \
  -H "Origin: https://evil.com"
# Expected: 403 Forbidden or no CORS headers

# Test 4: Preflight handling
curl -X OPTIONS https://staging.yourdomain.com/api/auth/login \
  -H "Origin: https://app.yourdomain.com" \
  -H "Access-Control-Request-Method: POST"
# Expected: 204 No Content with CORS headers

# Test 5: No extra methods allowed
curl -X PATCH https://staging.yourdomain.com/api/auth/login \
  -H "Origin: https://app.yourdomain.com"
# Expected: 403 Forbidden or 405 Method Not Allowed
```

**All Tests Passed**: _____ (Date: _____)

### 4. OWASP ZAP Security Scanning

```bash
# Prerequisites
# - OWASP ZAP installed
# - Staging environment accessible

# Run passive scan
# 1. Configure ZAP scope: https://staging.yourdomain.com
# 2. Spider the application
# 3. Run passive scan
# 4. Review findings

# Expected findings:
# ✅ CORS Misconfiguration: FIXED
# ✅ Missing Security Headers: FIXED
# ✅ Insecure Credential Sharing: FIXED

# If any FAIL: Return to development, fix, re-test
```

**ZAP Scan Result**: ✅ PASSED (Date: _____)  
**Report File**: `zap-report-staging-20260312.html`

### 5. Stakeholder Approval

- [ ] Security team reviewed CORS implementation
- [ ] Devops team reviewed configuration
- [ ] QA team tested all scenarios
- [ ] Product owner signed off
- [ ] Compliance team approved

**Approvals**:
- Security: _________________ (Date: _____)
- DevOps: _________________ (Date: _____)
- QA: _________________ (Date: _____)
- Product: _________________ (Date: _____)

---

## 🔒 Production Deployment

### Final Checks (1 hour before deployment)

```bash
# 1. Verify environment variables are correct
echo "ALLOWED_ORIGINS=$ALLOWED_ORIGINS"
echo "NODE_ENV=$NODE_ENV"
echo "CREDENTIAL_SHARING=$CREDENTIAL_SHARING"

# 2. Verify middleware.ts exists
ls -la src/middleware.ts

# 3. Verify no debug endpoints exposed
grep -r "enableLogging" . --include="*.ts" | grep -v "node_modules"
# Should not have debug endpoint logged

# 4. Final build test
npm run build
# No errors, no warnings about CORS
```

**Final Check Complete**: _____ (Date: _____)

### Deploy to Production

```bash
# Method 1: Vercel
vercel deploy --prod

# Method 2: Your preferred deployment
# (Ensure NODE_ENV=production)
```

**Production Deployment**: _____ (Date: _____)

### Post-Deployment Verification

```bash
# 1. Verify endpoints are accessible
curl https://yourdomain.com/api/auth/login -I

# 2. Check CORS headers are present
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Origin: https://app.yourdomain.com" -I | grep -i access-control

# 3. Verify wildcard is blocked
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Origin: *" -I
# Should NOT have Access-Control-Allow-Origin: *

# 4. Run diagnostic endpoint (may be disabled in prod)
curl https://yourdomain.com/api/debug/cors
# Expected: 403 Forbidden (disabled in production)

# 5. Check logs for CORS errors
# Application logs: grep "CORS" logs/
# No "Invalid origin" errors expected from legitimate sources
```

**Verification Complete**: _____ (Date: _____)

---

## 📊 Success Criteria

### Functional
- [ ] Same-origin requests work normally
- [ ] Trusted origin requests work with CORS headers
- [ ] Untrusted origin requests blocked
- [ ] Wildcard origins always blocked
- [ ] Preflight requests work correctly
- [ ] Authentication still works
- [ ] No false positives (legitimate users not blocked)

### Security
- [ ] No `Access-Control-Allow-Origin: *`
- [ ] No invalid origins allowed
- [ ] All security headers present
- [ ] OWASP ZAP scan clean
- [ ] No wildcard in configuration
- [ ] Credentials only with whitelisted origins
- [ ] All methods restricted to necessary ones

### Performance
- [ ] No noticeable latency increase
- [ ] Preflight requests cached (CORS_MAX_AGE respected)
- [ ] Middleware fast (<10ms in production)
- [ ] No memory leaks detected

### Monitoring
- [ ] Monitoring alerts configured for CORS errors
- [ ] Logging enabled for security events
- [ ] Dashboard tracking CORS rejections
- [ ] On-call team aware of CORS issues

---

## 🔄 Post-Deployment

### First 24 Hours
- [ ] Monitor error logs for unexpected CORS blocks
- [ ] Verify user feedback - no CORS-related complaints
- [ ] Check analytics - traffic normal
- [ ] Verify authentication working for all user types

### First Week
- [ ] Run OWASP ZAP scan on production
- [ ] Verify monitoring alerts working
- [ ] Review usage patterns
- [ ] Document any adjustments needed

### Ongoing
- [ ] Monthly review of ALLOWED_ORIGINS
- [ ] Quarterly security checks
- [ ] Update documentation as needed
- [ ] Monitor for unused origins (remove them)

---

## 📋 Rollback Plan

If problems occur:

```bash
# Option 1: Disable CORS (emergency)
# Set ALLOWED_ORIGINS to empty string
# This reverts to same-origin policy (safe)
export ALLOWED_ORIGINS=""

# Option 2: Add origin to whitelist (if legitimate blocked)
export ALLOWED_ORIGINS="https://yourdomain.com,https://newly-allowed.com"

# Option 3: Full rollback (if necessary)
git revert <commit-hash>
npm run build && vercel deploy --prod
```

**Rollback Timeline**:
- 15 minutes: Detect issue
- 30 minutes: Apply fix/rollback
- 45 minutes: Verify fix

---

## 📞 Support Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Security Lead | | | |
| DevOps Lead | | | |
| On-Call | | | |

---

## ✅ Sign-Off

Deployment prepared and reviewed by:

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Developer | _____________ | _____________ | _____ |
| Tech Lead | _____________ | _____________ | _____ |
| Security | _____________ | _____________ | _____ |

---

**Deployment Status**: NOT STARTED  
**Target Deployment Date**: ___________  
**Actual Deployment Date**: ___________  
**Production Verified**: ___________  

---

*Keep this checklist for audit purposes. File with deployment records.*
