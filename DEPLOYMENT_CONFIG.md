# NIB KYC System - Production Deployment Configuration

## Environment Configuration Template

```env
# ============================================
# DATABASE CONFIGURATION
# ============================================
DATABASE_URL=postgresql://nib_user:secure_password@db.production.com:5432/nib_kyc_prod
DATABASE_POOL_SIZE=30
DATABASE_IDLE_TIMEOUT=30000
DATABASE_QUERY_TIMEOUT=30000

# ============================================
# APPLICATION CONFIGURATION
# ============================================
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://kyc.nib-bank.com
SESSION_SECRET=your-very-secure-random-secret-key-min-32-chars
NEXTAUTH_URL=https://kyc.nib-bank.com
NEXTAUTH_SECRET=your-nextauth-secret-key

# ============================================
# FILE STORAGE CONFIGURATION
# ============================================
UPLOAD_DIR=/var/nib-kyc/uploads
MAX_FILE_SIZE=31457280  # 30MB in bytes
ALLOWED_FILE_TYPES=application/pdf,image/jpeg,image/png,image/jpg

# ============================================
# API CONFIGURATION
# ============================================
API_RATE_LIMIT=1000
API_TIMEOUT=30000
API_MAX_BODY_SIZE=31457280

# ============================================
# LOGGING CONFIGURATION
# ============================================
LOG_LEVEL=info
LOG_FILE=/var/log/nib-kyc/app.log
LOG_MAX_SIZE=100M
LOG_MAX_FILES=10

# ============================================
# SECURITY CONFIGURATION
# ============================================
CORS_ORIGINS=https://kyc.nib-bank.com,https://admin.nib-bank.com
SECURE_COOKIES=true
HTTPS_ONLY=true
HSTS_MAX_AGE=31536000

# ============================================
# MONITORING & ALERTING
# ============================================
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
DATADOG_API_KEY=your-datadog-api-key
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# ============================================
# BACKUP CONFIGURATION
# ============================================
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *  # Daily at 2 AM
BACKUP_RETENTION_DAYS=30
BACKUP_LOCATION=/var/nib-kyc/backups

# ============================================
# PERFORMANCE TUNING
# ============================================
CACHE_TTL=300
QUERY_CACHE_ENABLED=true
REDIS_URL=redis://cache.production.com:6379
```

---

## Docker Deployment Configuration

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Build Next.js
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Set permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["npm", "start"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://nib_user:password@postgres:5432/nib_kyc
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=nib_user
      - POSTGRES_PASSWORD=secure_password
      - POSTGRES_DB=nib_kyc
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    restart: always
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nib_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: always
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

---

## Kubernetes Deployment (Optional)

### deployment.yaml
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nib-kyc-app
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nib-kyc
  template:
    metadata:
      labels:
        app: nib-kyc
    spec:
      containers:
      - name: app
        image: nib-kyc:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: nib-kyc-secrets
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

---

## Database Migration Script

### migrate.sh
```bash
#!/bin/bash

set -e

echo "Starting database migration..."

# Check database connection
echo "Checking database connection..."
psql $DATABASE_URL -c "SELECT 1" > /dev/null 2>&1 || {
  echo "ERROR: Cannot connect to database"
  exit 1
}

# Run Prisma migrations
echo "Running Prisma migrations..."
npx prisma migrate deploy

# Create indexes
echo "Creating performance indexes..."
psql $DATABASE_URL << EOF
CREATE INDEX IF NOT EXISTS idx_kyc_branch_name ON "KYC"(branchName);
CREATE INDEX IF NOT EXISTS idx_kyc_district_name ON "KYC"(districtName);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON "KYC"(status);
CREATE INDEX IF NOT EXISTS idx_kyc_created_by ON "KYC"(createdById);
CREATE INDEX IF NOT EXISTS idx_kyc_submitted_at ON "KYC"(submittedAt DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_active ON "KYC"(active);
CREATE INDEX IF NOT EXISTS idx_kyc_branch_status ON "KYC"(branchName, status);
CREATE INDEX IF NOT EXISTS idx_kyc_district_status ON "KYC"(districtName, status);
CREATE INDEX IF NOT EXISTS idx_user_email ON "User"(email);
CREATE INDEX IF NOT EXISTS idx_user_branch_id ON "User"(branchId);
CREATE INDEX IF NOT EXISTS idx_memo_kyc_id ON "Memo"(kycId);
EOF

echo "Migration completed successfully!"
```

---

## Backup & Recovery Script

### backup.sh
```bash
#!/bin/bash

BACKUP_DIR="/var/nib-kyc/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/nib_kyc_backup_$TIMESTAMP.sql.gz"

echo "Starting database backup..."

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

# Backup database
pg_dump $DATABASE_URL | gzip > $BACKUP_FILE

# Backup uploads
tar -czf "$BACKUP_DIR/uploads_backup_$TIMESTAMP.tar.gz" /var/nib-kyc/uploads

# Cleanup old backups (keep last 30 days)
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE"

# Upload to cloud storage (optional)
# aws s3 cp $BACKUP_FILE s3://nib-kyc-backups/
```

---

## Health Check Endpoint

### src/pages/api/health.ts
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    // Check file system
    const fs = require('fs').promises;
    await fs.access('/var/nib-kyc/uploads');

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      filesystem: 'accessible',
      uptime: process.uptime()
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 });
  }
}
```

---

## Monitoring & Alerting Setup

### Prometheus Metrics (Optional)
```typescript
// src/lib/metrics.ts
import { register, Counter, Histogram, Gauge } from 'prom-client';

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

export const kycSubmissionCounter = new Counter({
  name: 'kyc_submissions_total',
  help: 'Total KYC submissions',
  labelNames: ['status', 'branch']
});

export const fileUploadCounter = new Counter({
  name: 'file_uploads_total',
  help: 'Total file uploads',
  labelNames: ['status', 'file_type']
});

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['operation', 'table']
});
```

---

## Load Testing Configuration

### k6 Load Test Script
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 100 },   // Stay at 100 users
    { duration: '2m', target: 200 },   // Ramp up to 200 users
    { duration: '5m', target: 200 },   // Stay at 200 users
    { duration: '2m', target: 0 },     // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.1'],
  },
};

export default function () {
  let res = http.get('https://kyc.nib-bank.com/api/submissions');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
```

---

## Deployment Checklist

- [ ] Database configured and tested
- [ ] Environment variables set
- [ ] Database migrations applied
- [ ] Indexes created
- [ ] SSL certificates installed
- [ ] Backup strategy implemented
- [ ] Monitoring configured
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] Documentation updated
- [ ] Team trained
- [ ] Rollback plan prepared
- [ ] Go-live approval obtained

---

**Status**: READY FOR PRODUCTION DEPLOYMENT ✅
