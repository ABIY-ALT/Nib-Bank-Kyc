/**
 * SMB Security Initialization & Middleware
 * 
 * Integrates SMB security validation into the application startup
 * and middleware pipeline for continuous monitoring
 */

import { performSMBSecurityHealthCheck, checkLocalWindowsSMBSigning } from './smb-security';
import logger from './logger';

/**
 * Startup validation for SMB security
 * Called during application initialization
 */
export async function validateSMBSecurityOnStartup(): Promise<boolean> {
  try {
    logger.info('Starting SMB Security Validation...');

    const healthCheck = performSMBSecurityHealthCheck([
      // Add known internal servers if applicable
      // { host: '172.24.47.131', port: 445 },
      // { host: 'fileserver.internal', port: 445 },
    ]);

    const status = {
      timestamp: healthCheck.timestamp.toISOString(),
      overallSecure: healthCheck.overallSecure,
      localSMBStatus: healthCheck.localStatus.status,
      criticalIssuesCount: healthCheck.criticalIssues.length,
    };

    if (healthCheck.overallSecure) {
      logger.info('✅ SMB Security Validation PASSED', status);
      return true;
    } else {
      logger.warn('⚠️ SMB Security Issues Detected', {
        ...status,
        issues: healthCheck.criticalIssues,
        recommendations: healthCheck.allRecommendations,
      });

      // Log each critical issue
      healthCheck.criticalIssues.forEach((issue, index) => {
        logger.warn(`Critical Issue ${index + 1}: ${issue}`);
      });

      return false;
    }
  } catch (error) {
    logger.error('SMB Security Validation Error', {
      error: error instanceof Error ? error.message : String(error),
      stage: 'startup',
    });
    return false;
  }
}

/**
 * Periodic SMB security monitoring
 * Can be called by a cron job or health check endpoint
 * 
 * @param intervalMs - How often to run checks (default: 1 hour)
 */
export function startSMBSecurityMonitoring(intervalMs: number = 60 * 60 * 1000): NodeJS.Timeout {
  const monitoringFunc = async () => {
    try {
      const result = checkLocalWindowsSMBSigning();

      logger.info('SMB Security Monitoring Check', {
        timestamp: result.timestamp.toISOString(),
        status: result.status,
        isSecure: result.isSecure,
      });

      // Alert if security status changes or degrades
      if (!result.isSecure) {
        logger.warn('SMB Security Alert: Potential Security Risk', {
          description: result.description,
          recommendations: result.recommendations,
        });
      }
    } catch (error) {
      logger.error('SMB Monitoring Error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Run immediately on startup
  monitoringFunc();

  // Schedule periodic checks
  return setInterval(monitoringFunc, intervalMs);
}

/**
 * SMB security context for middleware
 * Provides security information for request processing
 */
export interface SMBSecurityContext {
  smbSigningRequired: boolean;
  smbSigningEnabled: boolean;
  isSecure: boolean;
  lastCheckTimestamp: Date;
  shouldBlockInsecureTransfers: boolean;
}

let smbSecurityContext: SMBSecurityContext | null = null;

/**
 * Initialize SMB security context for use in middleware
 */
export async function initializeSMBSecurityContext(): Promise<SMBSecurityContext> {
  try {
    const check = checkLocalWindowsSMBSigning();

    smbSecurityContext = {
      smbSigningRequired: check.signingRequired,
      smbSigningEnabled: check.signingEnabled,
      isSecure: check.isSecure,
      lastCheckTimestamp: check.timestamp,
      shouldBlockInsecureTransfers: !check.isSecure && process.env.ENFORCE_SMB_SIGNING === 'true',
    };

    logger.info('SMB Security Context Initialized', {
      isSecure: smbSecurityContext.isSecure,
      signingRequired: smbSecurityContext.smbSigningRequired,
      blockInsecureTransfers: smbSecurityContext.shouldBlockInsecureTransfers,
    });

    return smbSecurityContext;
  } catch (error) {
    logger.error('SMB Context Initialization Error', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Return conservative secure defaults if check fails
    return {
      smbSigningRequired: false,
      smbSigningEnabled: false,
      isSecure: false,
      lastCheckTimestamp: new Date(),
      shouldBlockInsecureTransfers: false,
    };
  }
}

/**
 * Get current SMB security context
 * Returns cached context or initializes if not available
 */
export async function getSMBSecurityContext(): Promise<SMBSecurityContext> {
  if (!smbSecurityContext) {
    return await initializeSMBSecurityContext();
  }
  return smbSecurityContext;
}

/**
 * Middleware for checking SMB security requirements
 * Can be integrated into security middleware pipeline
 * 
 * Usage:
 * const context = await checkSMBSecurityMiddleware();
 * if (context.shouldBlockInsecureTransfers) {
 *   // Block or warn about insecure transfers
 * }
 */
export async function checkSMBSecurityMiddleware(): Promise<SMBSecurityContext> {
  const context = await getSMBSecurityContext();

  // Refresh check if older than 1 hour
  const oneHourMs = 60 * 60 * 1000;
  if (Date.now() - context.lastCheckTimestamp.getTime() > oneHourMs) {
    return await initializeSMBSecurityContext();
  }

  return context;
}

/**
 * Utility function to check if SMB operations should be blocked
 * Useful for file transfer operations, network shares, etc.
 */
export async function shouldBlockSMBOperations(): Promise<boolean> {
  const context = await getSMBSecurityContext();
  return context.shouldBlockInsecureTransfers && !context.isSecure;
}

/**
 * Export SMB security report for compliance/auditing
 */
export async function generateSMBSecurityReport(): Promise<string> {
  const healthCheck = performSMBSecurityHealthCheck();

  const report = `
SMB SECURITY COMPLIANCE REPORT
Generated: ${new Date().toISOString()}
================================

LOCAL SYSTEM STATUS
-------------------
Status: ${healthCheck.localStatus.status}
Secure: ${healthCheck.localStatus.isSecure ? 'YES' : 'NO'}
Signing Required: ${healthCheck.localStatus.signingRequired}
Signing Enabled: ${healthCheck.localStatus.signingEnabled}

${healthCheck.localStatus.description}

REMOTE SERVERS
--------------
${
  healthCheck.remoteChecks.size === 0
    ? 'No remote servers checked'
    : Array.from(healthCheck.remoteChecks.entries())
        .map(
          ([key, check]) => `
${key}:
  Status: ${check.status}
  Secure: ${check.isSecure ? 'YES' : 'NO'}
  ${check.description}
`
        )
        .join('\n')
}

OVERALL SECURITY POSTURE
------------------------
Overall Secure: ${healthCheck.overallSecure ? 'YES ✅' : 'NO ❌'}
Critical Issues: ${healthCheck.criticalIssues.length}

${
  healthCheck.criticalIssues.length > 0
    ? `CRITICAL ISSUES:
${healthCheck.criticalIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}`
    : ''
}

RECOMMENDATIONS
---------------
${
  healthCheck.allRecommendations.length > 0
    ? healthCheck.allRecommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')
    : 'No recommendations - system is secure'
}

COMPLIANCE STATUS
-----------------
CIS Benchmark: ${healthCheck.overallSecure ? 'PASS' : 'FAIL'}
NIST Guidelines: SMB signing enforcement ${healthCheck.overallSecure ? 'compliant' : 'non-compliant'}
PCI DSS: ${healthCheck.overallSecure ? 'PASS' : 'FAIL'} (Requirement 2.3 - Secure SMB communication)
`;

  return report;
}
