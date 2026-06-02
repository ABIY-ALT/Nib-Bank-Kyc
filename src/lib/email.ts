// Email helper for sending account notifications and password reset emails.
// Configured entirely from environment variables.
// Credentials are never exposed to the frontend, logs, or API responses.

import { logInstitutionalError } from './logger';
import { createAuditLog } from '@/actions/audit';

interface SendMailOptions {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface MailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  tls: { rejectUnauthorized: boolean };
  fromAddress: string;
  fromName: string;
  loginUrl: string;
}

interface EmailAuditContext {
  userId?: string | null;
  userEmail: string;
  userName?: string;
  action: 'USER_WELCOME' | 'ADMIN_PASSWORD_RESET' | 'PASSWORD_RESET_REQUEST';
  description: string;
}

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 1200;
const MAX_CONCURRENT_EMAILS = 2;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 5;
const TEMPORARY_SMTP_FAILURE_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ECONNABORTED',
  'EPIPE',
]);

let transporter: any = null;
let activeEmailWorkers = 0;
let emailQueue: Array<{ options: SendMailOptions; audit: EmailAuditContext; attempt: number }> = [];
let queueScheduled = false;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

export function validateEmailConfiguration(): { valid: boolean; message: string; config?: Partial<MailConfig> } {
  try {
    const config = getMailConfig();
    
    if (!config.enabled) {
      return {
        valid: false,
        message: 'SMTP configuration is disabled. Please set SMTP_HOST (or EMAIL_HOST) in environment variables.'
      };
    }

    if (!config.host) {
      return {
        valid: false,
        message: 'SMTP_HOST (or EMAIL_HOST) environment variable is not set.'
      };
    }

    if (!config.auth?.user) {
      return {
        valid: false,
        message: 'SMTP_USER (or EMAIL_USER) environment variable is not set.'
      };
    }

    return {
      valid: true,
      message: 'Email configuration is valid.',
      config: {
        host: config.host,
        port: config.port,
        secure: config.secure,
        fromAddress: config.fromAddress,
        fromName: config.fromName
      }
    };
  } catch (error: any) {
    return {
      valid: false,
      message: `Email configuration error: ${error.message}`
    };
  }
}

function getMailConfig(): MailConfig {
  // Support both legacy EMAIL_* and new SMTP_* environment variables
  const host = process.env.SMTP_HOST?.trim() || process.env.EMAIL_HOST?.trim() || '';
  const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587');
  const secure = process.env.SMTP_SECURE === 'true' || process.env.EMAIL_SECURE === 'true';
  const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false' && process.env.EMAIL_ALLOW_SELF_SIGNED !== 'true';
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  
  // Parse EMAIL_FROM format: "Name <email@example.com>" or just "email@example.com"
  let fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim() || process.env.EMAIL_FROM?.trim() || 'noreply@nibbank.com.et';
  let fromName = process.env.EMAIL_FROM_NAME?.trim() || 'NIB Bank KYC';
  
  if (fromAddress.includes('<') && fromAddress.includes('>')) {
    // Parse "Name <email@example.com>" format
    const match = fromAddress.match(/^([^<]+?)\s*<([^>]+)>$/);
    if (match) {
      fromName = match[1].trim();
      fromAddress = match[2].trim();
    }
  }
  
  const loginUrl = process.env.APP_BASE_URL?.trim();

  if (!loginUrl) {
    throw new Error('APP_BASE_URL is required in environment configuration.');
  }

  return {
    enabled: Boolean(host),
    host,
    port,
    secure,
    auth: smtpUser
      ? { user: smtpUser, pass: smtpPass || '' }
      : undefined,
    tls: { rejectUnauthorized },
    fromAddress,
    fromName,
    loginUrl,
  };
}

function getFromHeader(config: MailConfig) {
  const safeName = config.fromName.replace(/"/g, '');
  return `${safeName} <${config.fromAddress}>`;
}

function isRetryableError(error: any) {
  if (!error) return false;
  const code = String(error.code || '').toUpperCase();
  if (TEMPORARY_SMTP_FAILURE_CODES.has(code)) return true;
  if (error.responseCode && typeof error.responseCode === 'number') {
    return error.responseCode >= 400 && error.responseCode < 500 ? false : true;
  }
  return false;
}

function isRateLimited(recipient: string) {
  const normalized = recipient.toLowerCase().trim();
  const now = Date.now();
  const currentWindow = Math.floor(now / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
  const entry = rateLimitMap.get(normalized);

  if (!entry || entry.windowStart !== currentWindow) {
    rateLimitMap.set(normalized, { count: 1, windowStart: currentWindow });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_PER_WINDOW) {
    return true;
  }

  entry.count += 1;
  return false;
}

function getTransporter() {
  if (transporter) return transporter;

  const config = getMailConfig();
  if (!config.enabled) {
    throw new Error('SMTP configuration is missing. Email delivery is disabled.');
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    tls: config.tls,
    pool: true,
    maxConnections: MAX_CONCURRENT_EMAILS,
  });

  return transporter;
}

function scheduleEmailQueue() {
  if (queueScheduled) return;
  queueScheduled = true;
  setTimeout(() => {
    queueScheduled = false;
    processEmailQueue().catch((error) => {
      logInstitutionalError(error, 'EMAIL_QUEUE_PROCESS_ERROR');
    });
  }, 0);
}

async function processEmailQueue() {
  while (activeEmailWorkers < MAX_CONCURRENT_EMAILS && emailQueue.length > 0) {
    const job = emailQueue.shift();
    if (!job) continue;
    activeEmailWorkers += 1;
    void sendEmailJob(job).finally(() => {
      activeEmailWorkers -= 1;
      scheduleEmailQueue();
    });
  }
}

async function auditEmailEvent(status: 'QUEUED' | 'DELIVERED' | 'FAILED' | 'RATE_LIMITED', audit: EmailAuditContext, error?: any) {
  try {
    await createAuditLog({
      userId: audit.userId ?? null,
      userEmail: audit.userEmail,
      userName: audit.userName,
      action: audit.action,
      details: `${audit.description} | emailStatus=${status}` + (error ? ' | error=' + String(error.message || error) : ''),
      severity: status === 'FAILED' ? 'HIGH' : 'LOW',
      metadata: {
        event: status,
        recipient: audit.userEmail,
      },
    });
  } catch (err) {
    logInstitutionalError(err, 'EMAIL_AUDIT_LOG_FAILED');
  }
}

async function sendEmailJob(job: { options: SendMailOptions; audit: EmailAuditContext; attempt: number }) {
  const config = getMailConfig();
  if (!config.enabled) {
    await auditEmailEvent('FAILED', job.audit, new Error('SMTP disabled'));
    return;
  }

  try {
    const transporterInstance = getTransporter();
    await transporterInstance.sendMail(job.options);
    await auditEmailEvent('DELIVERED', job.audit);
  } catch (error: any) {
    const retry = job.attempt < MAX_RETRIES && isRetryableError(error);
    if (retry) {
      const nextAttempt = job.attempt + 1;
      const delay = RETRY_BACKOFF_MS * nextAttempt;
      setTimeout(() => {
        emailQueue.push({ ...job, attempt: nextAttempt });
        scheduleEmailQueue();
      }, delay);
      await auditEmailEvent('QUEUED', job.audit, error);
    } else {
      await auditEmailEvent('FAILED', job.audit, error);
      logInstitutionalError(error, 'EMAIL_SEND_FAILED');
    }
  }
}

export function queueMail(options: SendMailOptions, audit: EmailAuditContext) {
  const config = getMailConfig();
  if (!config.enabled) {
    const validation = validateEmailConfiguration();
    logInstitutionalError(
      new Error(`Email delivery disabled: ${validation.message}`),
      'EMAIL_CONFIG_DISABLED'
    );
    void auditEmailEvent('FAILED', audit, new Error('SMTP configuration missing'));
    return false;
  }

  if (isRateLimited(options.to)) {
    void auditEmailEvent('RATE_LIMITED', audit);
    return false;
  }

  emailQueue.push({ options, audit, attempt: 0 });
  void auditEmailEvent('QUEUED', audit);
  scheduleEmailQueue();
  return true;
}

function buildEmailButton(url: string, label: string) {
  return `<table role="presentation" width="100%" style="margin: 24px 0;">
    <tr>
      <td align="center">
        <a href="${url}" style="background-color:#B89334;border-radius:8px;color:#ffffff;display:inline-block;font-weight:700;line-height:1.5;padding:14px 24px;text-decoration:none;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function buildEmailTemplate(options: {
  subject: string;
  greeting: string;
  introduction?: string;
  callToActionLabel: string;
  callToActionUrl: string;
  lines: string[];
  footerNote: string;
}) {
  const introHtml = options.introduction ? `<p style="margin: 0 0 16px; line-height:1.75;">${options.introduction}</p>` : '';
  const htmlLines = options.lines.map((line) => `<p style="margin: 0 0 16px; line-height:1.75;">${line}</p>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>body{margin:0;padding:0;font-family:Segoe UI,Arial,sans-serif;background:#f1f5f9;color:#0f172a;}table{border-collapse:collapse;width:100%;}img{border:none;display:block;}a{color:#ffffff;text-decoration:none;} .container{max-width:640px;margin:0 auto;padding:24px;} .card{background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 20px 80px rgba(15,23,42,0.08);} .header{background:#0f172a;color:#f8fafc;padding:32px 24px;text-align:center;} .brand{font-size:18px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#f8fafc;} .body{padding:32px 24px;color:#0f172a;} .footer{padding:24px;color:#64748b;font-size:13px;text-align:center;} .button-wrapper{padding:0 0 24px;} .notice{background:#f8fafc;border-left:4px solid #B89334;padding:18px;border-radius:12px;margin:24px 0 0;color:#0f172a;}</style></head><body><div class="container"><div class="card"><div class="header"><div class="brand">NIB Bank</div><h1 style="font-size:28px;line-height:1.1;margin:16px 0 0;">${options.subject}</h1></div><div class="body"><p style="margin:0 0 24px;font-size:16px;line-height:1.75;">${options.greeting}</p>${introHtml}${htmlLines}<div class="button-wrapper">${buildEmailButton(options.callToActionUrl, options.callToActionLabel)}</div><div class="notice"><strong>Important:</strong> ${options.footerNote}</div></div><div class="footer">© 2026 NIB Bank. For assistance, contact your IT support team.</div></div></div></body></html>`;

  const textLines = [
    options.subject,
    '',
    options.greeting,
  ];

  if (options.introduction) {
    textLines.push('', options.introduction);
  }

  textLines.push('', ...options.lines, '', `${options.callToActionLabel}: ${options.callToActionUrl}`, '', `Important: ${options.footerNote}`, '', '© 2026 NIB Bank. For assistance, contact your IT support team.');

  return { subject: options.subject, html, text: textLines.join('\n') };
}

export function queueWelcomeEmail(params: {
  userId?: string | null;
  userName: string;
  userEmail: string;
  username: string;
  temporaryPassword: string;
}) {
  const config = getMailConfig();
  const loginUrl = `${config.loginUrl.replace(/\/$/, '')}/login`;
  const subject = 'Welcome to the NIB Bank KYC Portal';
  const greeting = `Hello ${params.userName},`;
  const lines = [
    `Your account has been created for the NIB Bank KYC Portal.`,
    `Username: ${params.username}`,
    `Temporary password: ${params.temporaryPassword}`,
    'Please sign in using the button below and change your password immediately after your first login.',
  ];

  const template = buildEmailTemplate({
    subject,
    greeting,
    introduction: '',
    callToActionLabel: 'Sign in to NIB KYC Portal',
    callToActionUrl: loginUrl,
    lines,
    footerNote: 'For security, change your password immediately after signing in and do not share it with anyone.',
  });

  const mailOptions: SendMailOptions = {
    from: getFromHeader(config),
    to: params.userEmail,
    subject: template.subject,
    text: template.text,
    html: template.html,
  };

  return queueMail(mailOptions, {
    userId: params.userId ?? null,
    userEmail: params.userEmail,
    userName: params.userName,
    action: 'USER_WELCOME',
    description: 'New user welcome email queued.',
  });
}

export function queueAdminPasswordResetEmail(params: {
  userId?: string | null;
  userName: string;
  userEmail: string;
  username: string;
  temporaryPassword: string;
}) {
  const config = getMailConfig();
  const loginUrl = `${config.loginUrl.replace(/\/$/, '')}/login`;
  const subject = 'NIB Bank KYC Portal Password Reset Notification';
  const greeting = `Hello ${params.userName},`;
  const lines = [
    `Your password has been reset by an administrator.`,
    `Username: ${params.username}`,
    `Temporary password: ${params.temporaryPassword}`,
    'For your security, sign in and change your password immediately after logging in.',
  ];

  const template = buildEmailTemplate({
    subject,
    greeting,
    introduction: '',
    callToActionLabel: 'Sign in to NIB KYC Portal',
    callToActionUrl: loginUrl,
    lines,
    footerNote: 'This email was sent over a secure channel. If you did not request a password reset, contact IT security immediately.',
  });

  const mailOptions: SendMailOptions = {
    from: getFromHeader(config),
    to: params.userEmail,
    subject: template.subject,
    text: template.text,
    html: template.html,
  };

  return queueMail(mailOptions, {
    userId: params.userId ?? null,
    userEmail: params.userEmail,
    userName: params.userName,
    action: 'ADMIN_PASSWORD_RESET',
    description: 'Administrator password reset notification queued.',
  });
}

export function queuePasswordResetRequestEmail(params: {
  userId?: string | null;
  userName: string;
  userEmail: string;
  resetLink: string;
}) {
  const config = getMailConfig();
  const subject = 'NIB Bank KYC Portal Password Reset Link';
  const greeting = `Hello ${params.userName},`;
  const lines = [
    'A password reset request was received for your account.',
    'If you did not request this reset, please ignore this email or contact IT security.',
  ];

  const template = buildEmailTemplate({
    subject,
    greeting,
    introduction: '',
    callToActionLabel: 'Complete Password Reset',
    callToActionUrl: params.resetLink,
    lines,
    footerNote: 'This link expires in 15 minutes and is valid for one use only. Do not share it with anyone.',
  });

  const mailOptions: SendMailOptions = {
    from: getFromHeader(config),
    to: params.userEmail,
    subject: template.subject,
    text: template.text,
    html: template.html,
  };

  return queueMail(mailOptions, {
    userId: params.userId ?? null,
    userEmail: params.userEmail,
    userName: params.userName,
    action: 'PASSWORD_RESET_REQUEST',
    description: 'Password reset request email queued.',
  });
}

export async function sendPasswordResetEmail(
  userEmail: string,
  resetLink: string,
  userName?: string
): Promise<boolean> {
  const config = getMailConfig();
  if (!config.enabled) {
    return false;
  }

  const mailOptions: SendMailOptions = {
    from: getFromHeader(config),
    to: userEmail,
    subject: 'Password Reset Request',
    html: `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>body{margin:0;padding:0;font-family:Segoe UI,Arial,sans-serif;background:#f1f5f9;color:#0f172a;} .container{max-width:640px;margin:0 auto;padding:24px;} .card{background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 20px 80px rgba(15,23,42,0.08);} .header{background:#0f172a;color:#f8fafc;padding:32px 24px;text-align:center;} .button{display:inline-block;background:#B89334;color:#ffffff;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:700;}.body{padding:32px 24px;color:#0f172a;line-height:1.75;} .footer{padding:24px;color:#64748b;font-size:13px;text-align:center;} .notice{background:#f8fafc;border-left:4px solid #B89334;padding:18px;border-radius:12px;margin-top:24px;}</style></head><body><div class="container"><div class="card"><div class="header"><h1>Password Reset Request</h1></div><div class="body"><p>${userName ? `Hello ${userName},` : 'Hello,'}</p><p>We received a request to reset your password for the NIB Bank KYC Portal.</p><p>Please click the button below to complete your password reset. This link will expire in 15 minutes.</p><p style="text-align:center;"> <a href="${resetLink}" class="button">Reset Password</a> </p><p>If the button does not work, copy and paste the following link into your browser:</p><p><a href="${resetLink}" style="color:#0f172a;word-break:break-all;">${resetLink}</a></p><div class="notice"><strong>Security Notice:</strong> Never share this link or your password with anyone. NIB Bank staff will never ask for your password.</div></div><div class="footer">© 2026 NIB Bank. All rights reserved.</div></div></div></body></html>`,
    text: `Password Reset Request\n\n${userName ? `Hello ${userName},` : 'Hello,'}\n\nWe received a request to reset your password for the NIB Bank KYC Portal.\n\nComplete your password reset: ${resetLink}\n\nIf you did not request this, ignore this email. Never share your password or reset link with anyone.\n\n© 2026 NIB Bank. All rights reserved.`,
  };

  return queueMail(mailOptions, {
    userId: null,
    userEmail,
    userName,
    action: 'PASSWORD_RESET_REQUEST',
    description: 'Password reset link email queued.',
  });
}
