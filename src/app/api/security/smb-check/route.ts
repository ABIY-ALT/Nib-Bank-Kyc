/**
 * SMB Security Health Check API Route
 * 
 * Provides endpoints for monitoring SMB signing compliance:
 * - GET /api/security/smb-check - Local SMB configuration check
 * - GET /api/security/smb-check?host=IP&port=445 - Remote server check
 * 
 * This endpoint is useful for:
 * - Security dashboards and monitoring
 * - Pre-deployment compliance verification
 * - Incident response and forensics
 * - Integration with SIEM systems
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  performSMBSecurityHealthCheck,
  checkLocalWindowsSMBSigning,
  checkRemoteSMBSigning,
  exportSMBSecurityStatus,
  SMBSigningStatus,
} from '@/lib/smb-security';
import logger from '@/lib/logger';

/**
 * Rate limiting for security endpoints (prevent scanning abuse)
 */
const RATE_LIMIT_CHECKS: Map<string, number[]> = new Map();
const MAX_REQUESTS_PER_MINUTE = 5;

function isRateLimited(clientId: string): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  const timestamps = RATE_LIMIT_CHECKS.get(clientId) || [];
  const recentRequests = timestamps.filter(ts => ts > oneMinuteAgo);

  if (recentRequests.length >= MAX_REQUESTS_PER_MINUTE) {
    return true;
  }

  recentRequests.push(now);
  RATE_LIMIT_CHECKS.set(clientId, recentRequests);

  return false;
}

/**
 * GET /api/security/smb-check
 * 
 * Query parameters:
 * - host: Optional remote host to check (e.g., 172.24.47.131)
 * - port: Optional remote port (default 445)
 * - remoteServers: Optional JSON array of servers to check
 */
export async function GET(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const clientIp = request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') ||
                    'unknown';

    // Check rate limiting
    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Maximum 5 checks per minute.',
          timestamp: new Date().toISOString(),
        },
        { status: 429 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const host = searchParams.get('host');
    const port = searchParams.get('port') ? parseInt(searchParams.get('port')!, 10) : 445;
    const performHealthCheck = searchParams.get('healthCheck') === 'true';
    const remoteServersParam = searchParams.get('remoteServers');

    // Parse remote servers array if provided
    let remoteServers: Array<{ host: string; port?: number }> | undefined;
    if (remoteServersParam) {
      try {
        remoteServers = JSON.parse(remoteServersParam);
      } catch (error) {
        return NextResponse.json(
          {
            error: 'Invalid remoteServers JSON format',
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
      }
    }

    let result;

    if (performHealthCheck) {
      // Full health check including all configured servers
      result = performSMBSecurityHealthCheck(remoteServers);

      return NextResponse.json(
        {
          healthCheck: true,
          overallSecure: result.overallSecure,
          localStatus: exportSMBSecurityStatus(result.localStatus),
          remoteChecks: Object.fromEntries(
            Array.from(result.remoteChecks.entries()).map(([key, value]) => [
              key,
              exportSMBSecurityStatus(value),
            ])
          ),
          criticalIssues: result.criticalIssues,
          recommendations: result.allRecommendations,
          timestamp: result.timestamp.toISOString(),
        },
        { status: result.overallSecure ? 200 : 200 } // Return 200 even for failures to provide data
      );
    } else if (host) {
      // Check specific remote host
      if (!host.match(/^[a-zA-Z0-9.\-:]+$/)) {
        return NextResponse.json(
          {
            error: 'Invalid host format',
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
      }

      const checkResult = checkRemoteSMBSigning(host, port);

      logger.info('Remote SMB Check Performed', {
        host,
        port,
        status: checkResult.status,
        clientIp,
      });

      return NextResponse.json(
        {
          host,
          port,
          ...exportSMBSecurityStatus(checkResult),
        },
        { status: 200 }
      );
    } else {
      // Check local SMB configuration (default)
      const checkResult = checkLocalWindowsSMBSigning();

      logger.info('Local SMB Check Performed', {
        status: checkResult.status,
        clientIp,
      });

      return NextResponse.json(
        {
          type: 'local',
          ...exportSMBSecurityStatus(checkResult),
        },
        { status: 200 }
      );
    }
  } catch (error) {
    logger.error('SMB Security Check Error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error: 'Internal server error during SMB security check',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/security/smb-check
 * 
 * For performing comprehensive health checks with detailed configuration
 * 
 * Request body:
 * {
 *   "remoteServers": [
 *     { "host": "172.24.47.131", "port": 445 },
 *     { "host": "fileserver.internal", "port": 445 }
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const remoteServers = body.remoteServers || [];

    if (!Array.isArray(remoteServers)) {
      return NextResponse.json(
        {
          error: 'remoteServers must be an array',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Validate remote servers format
    for (const server of remoteServers) {
      if (!server.host || typeof server.host !== 'string') {
        return NextResponse.json(
          {
            error: 'Each server must have a valid host property',
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
      }
    }

    const result = performSMBSecurityHealthCheck(remoteServers);

    logger.info('SMB Health Check Performed', {
      remoteServerCount: remoteServers.length,
      overallSecure: result.overallSecure,
      criticalIssueCount: result.criticalIssues.length,
    });

    return NextResponse.json(
      {
        healthCheck: true,
        overallSecure: result.overallSecure,
        securityScore: result.overallSecure ? 100 : Math.max(0, 100 - result.criticalIssues.length * 20),
        localStatus: exportSMBSecurityStatus(result.localStatus),
        remoteChecks: Object.fromEntries(
          Array.from(result.remoteChecks.entries()).map(([key, value]) => [
            key,
            exportSMBSecurityStatus(value),
          ])
        ),
        criticalIssues: result.criticalIssues,
        recommendations: result.allRecommendations,
        timestamp: result.timestamp.toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('SMB Health Check Error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error: 'Internal server error during SMB health check',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
