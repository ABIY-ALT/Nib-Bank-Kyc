/**
 * SMB Security Validation Module
 * SECURITY FOCUS: SMB Signing Enforcement
 * CVE Prevention: Man-in-the-Middle (MITM), NTLM Relay Attacks
 * 
 * Implements validation and monitoring for SMB (Server Message Block) signing:
 * - Detects if SMB signing is required/enforced on target servers
 * - Monitors SMB configuration compliance
 * - Validates secure SMB connections
 * - Provides security health checks and logging
 * 
 * Security Risks Mitigated:
 * ❌ Man-in-the-Middle (MITM) attacks on SMB traffic
 * ❌ NTLM relay attacks (credential abuse without password)
 * ❌ Unauthorized file access/modification via SMB
 * ❌ Lateral movement in internal networks
 * ❌ Data integrity compromise
 * 
 * Vulnerability Context:
 * - Nmap detected SMB on 172.24.47.131:445 with signing not required
 * - Affects Windows file sharing, print services, and network authentication
 * - Server-side configuration but application-level monitoring is critical
 */

import { execSync, spawnSync } from 'child_process';
import os from 'os';
import logger from './logger';

/**
 * SMB Security Status enumeration
 */
export enum SMBSigningStatus {
  ENABLED_REQUIRED = 'ENABLED_REQUIRED', // ✅ Secure - signing required
  ENABLED_NOT_REQUIRED = 'ENABLED_NOT_REQUIRED', // ⚠️ Medium - signing enabled but not required
  DISABLED = 'DISABLED', // ❌ Insecure - signing disabled
  UNKNOWN = 'UNKNOWN', // ❓ Unable to determine
  UNAVAILABLE = 'UNAVAILABLE', // System doesn't support SMB check
}

/**
 * SMB Configuration Check Result
 */
export interface SMBSecurityCheckResult {
  status: SMBSigningStatus;
  description: string;
  signingRequired: boolean;
  signingEnabled: boolean;
  isSecure: boolean;
  timestamp: Date;
  recommendations?: string[];
  rawOutput?: string;
}

/**
 * Target server SMB information
 */
export interface SMBServerInfo {
  host: string;
  port: number;
  signingRequired: boolean;
  signingEnabled: boolean;
  smbVersion?: string;
  capabilities?: string[];
}

/**
 * Determines the current operating system
 * @returns OS name or UNKNOWN
 */
function getOperatingSystem(): string {
  const platform = os.platform();
  if (platform === 'win32') return 'Windows';
  if (platform === 'darwin') return 'macOS';
  if (platform === 'linux') return 'Linux';
  return 'UNKNOWN';
}

/**
 * Checks local Windows SMB configuration using PowerShell
 * Requires Windows 7+ with SMB v3 support
 * 
 * @returns SMB security status for local system
 */
export function checkLocalWindowsSMBSigning(): SMBSecurityCheckResult {
  const timestamp = new Date();
  const osType = getOperatingSystem();

  // Only works on Windows
  if (osType !== 'Windows') {
    return {
      status: SMBSigningStatus.UNAVAILABLE,
      description: `SMB signing check not available on ${osType}. This check requires Windows.`,
      signingRequired: false,
      signingEnabled: false,
      isSecure: false,
      timestamp,
      recommendations: ['Run this check on a Windows system to verify local SMB configuration'],
    };
  }

  try {
    // PowerShell command to check SMB signing requirements
    // These settings control whether the local system requires/enables SMB message signing
    const psCommand = `
      $signingRequired = (Get-SmbServerConfiguration -ErrorAction SilentlyContinue | Select-Object RequireSecuritySignature).RequireSecuritySignature;
      $signingEnabled = (Get-SmbServerConfiguration -ErrorAction SilentlyContinue | Select-Object EnableSecuritySignature).EnableSecuritySignature;
      Write-Output "RequireSecuritySignature: $signingRequired"
      Write-Output "EnableSecuritySignature: $signingEnabled"
    `;

    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', psCommand], {
      encoding: 'utf-8',
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (result.error || result.status !== 0) {
      logger.warn('SMB Security Check Failed', {
        error: result.error?.message || result.stderr,
        status: result.status,
      });

      return {
        status: SMBSigningStatus.UNKNOWN,
        description: 'Unable to determine SMB signing configuration. PowerShell command failed.',
        signingRequired: false,
        signingEnabled: false,
        isSecure: false,
        timestamp,
        recommendations: [
          'Run PowerShell as Administrator',
          'Ensure SMB v3 is installed (Windows 7 SP1+)',
          'Check Windows firewall and UAC settings',
        ],
        rawOutput: result.stderr || 'No error output available',
      };
    }

    // Parse PowerShell output
    const output = result.stdout || '';
    const signingRequired = output.includes('RequireSecuritySignature: True');
    const signingEnabled = output.includes('EnableSecuritySignature: True');

    // Determine security status
    let status: SMBSigningStatus;
    let isSecure: boolean;
    let description: string;
    const recommendations: string[] = [];

    if (signingRequired && signingEnabled) {
      status = SMBSigningStatus.ENABLED_REQUIRED;
      isSecure = true;
      description = '✅ SMB signing is REQUIRED and ENABLED. Maximum security.';
    } else if (signingEnabled && !signingRequired) {
      status = SMBSigningStatus.ENABLED_NOT_REQUIRED;
      isSecure = false;
      description = '⚠️ SMB signing is enabled but NOT required. Clients may skip signing.';
      recommendations.push('Enable Group Policy: "Microsoft network server: Digitally sign communications (always)"');
    } else if (!signingRequired && !signingEnabled) {
      status = SMBSigningStatus.DISABLED;
      isSecure = false;
      description = '❌ SMB signing is DISABLED. System is vulnerable to MITM and NTLM relay attacks.';
      recommendations.push('Immediately enable SMB signing via Group Policy or registry');
      recommendations.push('Apply security updates and patches');
    } else {
      status = SMBSigningStatus.UNKNOWN;
      isSecure = false;
      description = 'SMB signing status is unclear. Manual verification recommended.';
    }

    if (!isSecure) {
      recommendations.push('Restrict SMB access via firewall (port 445/139)');
      recommendations.push('Use VPN or IPSec for internal network access');
      recommendations.push('Monitor SMB traffic for suspicious activity');
    }

    return {
      status,
      description,
      signingRequired,
      signingEnabled,
      isSecure,
      timestamp,
      recommendations,
      rawOutput: output,
    };
  } catch (error) {
    logger.error('SMB Security Check Exception', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      status: SMBSigningStatus.UNKNOWN,
      description: `Error checking SMB signing configuration: ${error instanceof Error ? error.message : String(error)}`,
      signingRequired: false,
      signingEnabled: false,
      isSecure: false,
      timestamp,
      recommendations: ['Contact system administrator for SMB configuration verification'],
    };
  }
}

/**
 * Checks remote SMB server signing requirement using nmap or similar tools
 * This validates external/remote SMB servers
 * 
 * @param host - Target host IP or hostname
 * @param port - SMB port (default 445)
 * @returns SMB security status for remote server
 */
export function checkRemoteSMBSigning(
  host: string,
  port: number = 445
): SMBSecurityCheckResult {
  const timestamp = new Date();

  // Validate input
  if (!host || host.trim() === '') {
    return {
      status: SMBSigningStatus.UNKNOWN,
      description: 'Invalid host address provided.',
      signingRequired: false,
      signingEnabled: false,
      isSecure: false,
      timestamp,
      recommendations: ['Provide a valid IP address or hostname'],
    };
  }

  try {
    // Use nmap SMB scripts to check signing requirement
    // Note: Requires nmap to be installed on the system
    const nmapCommand = `nmap -p ${port} --script smb-security-mode ${host}`;

    const result = spawnSync('cmd.exe', ['/c', nmapCommand], {
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (result.status !== 0 && result.status !== 1) {
      // Note: nmap may return status 1 for some valid results
      logger.warn('Remote SMB Check Failed', {
        host,
        port,
        error: result.stderr,
        status: result.status,
      });

      return {
        status: SMBSigningStatus.UNKNOWN,
        description: `Unable to scan remote SMB server at ${host}:${port}. Nmap may not be installed.`,
        signingRequired: false,
        signingEnabled: false,
        isSecure: false,
        timestamp,
        recommendations: [
          'Install nmap: https://nmap.org/download.html',
          'Ensure firewall allows outbound connections to SMB port 445',
          'Verify target host is reachable',
        ],
        rawOutput: result.stderr || 'Command failed',
      };
    }

    const output = result.stdout || '';

    // Parse nmap output for SMB signing status
    const signingRequired = output.includes('message_signing: disabled') === false &&
                           output.includes('signing required');
    const signingEnabled = output.includes('message_signing: enabled') ||
                          output.includes('Message signing') && !output.includes('disabled');

    // Determine security status
    let status: SMBSigningStatus;
    let isSecure: boolean;
    let description: string;
    const recommendations: string[] = [];

    if (signingRequired) {
      status = SMBSigningStatus.ENABLED_REQUIRED;
      isSecure = true;
      description = `✅ Remote server ${host}:${port} requires SMB signing. Secure configuration.`;
    } else if (signingEnabled && !signingRequired) {
      status = SMBSigningStatus.ENABLED_NOT_REQUIRED;
      isSecure = false;
      description = `⚠️ Remote server ${host}:${port} has SMB signing enabled but NOT required.`;
      recommendations.push('Contact server administrator to enforce message signing');
    } else if (!signingRequired && !signingEnabled) {
      status = SMBSigningStatus.DISABLED;
      isSecure = false;
      description = `❌ Remote server ${host}:${port} does NOT require SMB signing. VULNERABLE TO ATTACKS.`;
      recommendations.push('Avoid SMB connections to this server if possible');
      recommendations.push('Contact server administrator to enable SMB signing');
      recommendations.push('For Windows: Apply Group Policy "Digitally sign communications (always)"');
      recommendations.push('For Samba: Set "server signing = mandatory" in smb.conf');
    } else {
      status = SMBSigningStatus.UNKNOWN;
      isSecure = false;
      description = `Unable to determine SMB signing status for ${host}:${port}`;
    }

    if (!isSecure) {
      recommendations.push('Use firewall rules to restrict SMB access');
      recommendations.push('Monitor connections to this server');
      recommendations.push('Consider using VPN or IPSec encryption as alternative');
    }

    return {
      status,
      description,
      signingRequired,
      signingEnabled,
      isSecure,
      timestamp,
      recommendations,
      rawOutput: output,
    };
  } catch (error) {
    logger.error('Remote SMB Check Exception', {
      host,
      port,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      status: SMBSigningStatus.UNKNOWN,
      description: `Error checking remote SMB server: ${error instanceof Error ? error.message : String(error)}`,
      signingRequired: false,
      signingEnabled: false,
      isSecure: false,
      timestamp,
      recommendations: [
        'Ensure nmap is installed',
        'Verify network connectivity to target host',
        'Check firewall rules',
      ],
    };
  }
}

/**
 * Validates SMB connection security before attempting data transfer
 * Can be used as a pre-flight check before file uploads/downloads
 * 
 * @param host - Target SMB server
 * @param port - SMB port
 * @returns true if connection is secure, false otherwise
 */
export function validateSMBConnectionSecurity(host: string, port: number = 445): boolean {
  try {
    const check = checkRemoteSMBSigning(host, port);
    
    if (check.isSecure && check.status === SMBSigningStatus.ENABLED_REQUIRED) {
      logger.info('SMB Connection Validated', {
        host,
        port,
        status: check.status,
      });
      return true;
    }

    logger.warn('SMB Connection Security Issue', {
      host,
      port,
      status: check.status,
      description: check.description,
    });

    return false;
  } catch (error) {
    logger.error('SMB Validation Exception', {
      host,
      port,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Comprehensive SMB security health check
 * Validates both local and remote SMB configurations
 * Returns overall security posture
 * 
 * @param remoteServers - Optional array of remote servers to check
 * @returns Overall security status and recommendations
 */
export interface SMBSecurityHealthCheck {
  localStatus: SMBSecurityCheckResult;
  remoteChecks: Map<string, SMBSecurityCheckResult>;
  overallSecure: boolean;
  criticalIssues: string[];
  allRecommendations: string[];
  timestamp: Date;
}

export function performSMBSecurityHealthCheck(
  remoteServers?: Array<{ host: string; port?: number }>
): SMBSecurityHealthCheck {
  const timestamp = new Date();
  const criticalIssues: string[] = [];
  const allRecommendations: Set<string> = new Set();

  // Check local SMB configuration
  const localStatus = checkLocalWindowsSMBSigning();
  if (!localStatus.isSecure) {
    criticalIssues.push(`Local system: ${localStatus.description}`);
    localStatus.recommendations?.forEach(rec => allRecommendations.add(rec));
  }

  // Check remote servers if provided
  const remoteChecks = new Map<string, SMBSecurityCheckResult>();
  if (remoteServers && remoteServers.length > 0) {
    remoteServers.forEach(server => {
      const check = checkRemoteSMBSigning(server.host, server.port || 445);
      const key = `${server.host}:${server.port || 445}`;
      remoteChecks.set(key, check);

      if (!check.isSecure) {
        criticalIssues.push(`${key}: ${check.description}`);
        check.recommendations?.forEach(rec => allRecommendations.add(rec));
      }
    });
  }

  const overallSecure = criticalIssues.length === 0 && localStatus.isSecure;

  // Log health check results
  if (overallSecure) {
    logger.info('SMB Security Health Check: PASSED', {
      timestamp,
      localStatus: localStatus.status,
    });
  } else {
    logger.warn('SMB Security Health Check: FAILED', {
      timestamp,
      criticalIssues,
      localStatus: localStatus.status,
    });
  }

  return {
    localStatus,
    remoteChecks,
    overallSecure,
    criticalIssues,
    allRecommendations: Array.from(allRecommendations),
    timestamp,
  };
}

/**
 * Exports security status for monitoring/alerting systems
 * Useful for dashboards and security information and event management (SIEM)
 * 
 * @param result - SMB security check result
 * @returns JSON-serializable object for logging/export
 */
export function exportSMBSecurityStatus(result: SMBSecurityCheckResult): Record<string, unknown> {
  return {
    timestamp: result.timestamp.toISOString(),
    status: result.status,
    description: result.description,
    signingRequired: result.signingRequired,
    signingEnabled: result.signingEnabled,
    isSecure: result.isSecure,
    recommendations: result.recommendations || [],
    severity: result.isSecure ? 'LOW' : 'HIGH',
    recommendedAction: !result.isSecure ? 'IMMEDIATE' : 'MONITOR',
  };
}
