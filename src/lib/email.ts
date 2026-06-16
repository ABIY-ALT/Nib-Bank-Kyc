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
  action: 'USER_WELCOME' | 'ADMIN_PASSWORD_RESET' | 'ACCOUNT_SETUP' | 'PASSWORD_RESET_REQUESTED';
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
  // Gmail app passwords are shown with spaces for readability (e.g. "xxxx xxxx xxxx xxxx")
  // but the SMTP server expects them without spaces. Strip all whitespace here.
  const smtpPass = (process.env.SMTP_PASS || process.env.EMAIL_PASS)?.replace(/\s/g, '');
  
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

function buildEmailTemplate(options: {
  logoUrl: string;
  subject: string;
  heading: string;
  greeting: string;
  bodyLines: string[];
  validityLine?: string;
  callToActionLabel: string;
  callToActionUrl: string;
  ignoreNote: string;
}) {
  const bodyHtml = options.bodyLines
    .map((l) => `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.75;">${l}</p>`)
    .join('');

  const validityHtml = options.validityLine
    ? `<p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.75;">${options.validityLine}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${options.subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f0eb;font-family:Helvetica Neue,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0eb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <!-- CARD -->
          <tr>
            <td style="background:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

              <!-- LOGO -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <img src="${options.logoUrl}" alt="NIB Bank" width="64" height="64" style="border-radius:50%;display:block;"/>
                  </td>
                </tr>

                <!-- HEADING -->
                <tr>
                  <td style="padding-bottom:24px;">
                    <h1 style="margin:0;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">${options.heading}</h1>
                  </td>
                </tr>

                <!-- GREETING -->
                <tr>
                  <td style="padding-bottom:12px;">
                    <p style="margin:0;color:#374151;font-size:15px;line-height:1.75;">${options.greeting}</p>
                  </td>
                </tr>

                <!-- BODY -->
                <tr>
                  <td style="padding-bottom:4px;">
                    ${bodyHtml}
                    ${validityHtml}
                  </td>
                </tr>

                <!-- BUTTON -->
                <tr>
                  <td align="center" style="padding:8px 0 28px;">
                    <a href="${options.callToActionUrl}"
                       style="display:inline-block;background:#8B5E2E;color:#ffffff;font-size:16px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.01em;">
                      ${options.callToActionLabel} &rarr;
                    </a>
                  </td>
                </tr>

                <!-- IGNORE NOTE -->
                <tr>
                  <td>
                    <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.6;">${options.ignoreNote}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding:24px 0 0;">
              <p style="margin:0;color:#9CA3AF;font-size:12px;">This is an automated message. Please do not reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    options.heading,
    '',
    options.greeting,
    '',
    ...options.bodyLines,
  ];
  if (options.validityLine) textLines.push('', options.validityLine);
  textLines.push(
    '',
    `${options.callToActionLabel}: ${options.callToActionUrl}`,
    '',
    options.ignoreNote,
    '',
    'This is an automated message. Please do not reply.',
  );

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
  const baseUrl = config.loginUrl.replace(/\/$/, '');
  const loginUrl = `${baseUrl}/login`;
  const subject = 'Welcome to the NIB Bank KYC Portal';

  const template = buildEmailTemplate({
    logoUrl: `${baseUrl}/logo.png`,
    subject,
    heading: 'Welcome to NIB Bank KYC',
    greeting: `Hello ${params.userName},`,
    bodyLines: [
      'Your account has been created on the NIB Bank KYC Portal.',
      `Your username is: <strong>${params.username}</strong>`,
      `Temporary password: <strong>${params.temporaryPassword}</strong>`,
      'Please sign in using the button below and change your password immediately after your first login.',
    ],
    callToActionLabel: 'Sign In to NIB KYC Portal',
    callToActionUrl: loginUrl,
    ignoreNote: 'If you did not expect this email, please contact your IT administrator immediately.',
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
  const baseUrl = config.loginUrl.replace(/\/$/, '');
  const loginUrl = `${baseUrl}/login`;
  const subject = 'Your NIB Bank KYC Password Has Been Reset';

  const template = buildEmailTemplate({
    logoUrl: `${baseUrl}/logo.png`,
    subject,
    heading: 'Your Password Has Been Reset',
    greeting: `Hello ${params.userName},`,
    bodyLines: [
      'An administrator has reset your password on the NIB Bank KYC Portal.',
      `Your username is: <strong>${params.username}</strong>`,
      `Temporary password: <strong>${params.temporaryPassword}</strong>`,
      'Please sign in using the button below and change your password immediately.',
    ],
    callToActionLabel: 'Sign In to NIB KYC Portal',
    callToActionUrl: loginUrl,
    ignoreNote: 'If you did not expect this change, contact IT security immediately.',
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

export function sendPasswordResetEmail(userEmail: string, resetLink: string, userName: string) {
  const config = getMailConfig();
  const baseUrl = config.loginUrl.replace(/\/$/, '');
  const subject = 'Reset Your NIB Bank KYC Portal Password';

  const template = buildEmailTemplate({
    logoUrl: `${baseUrl}/logo.png`,
    subject,
    heading: 'Password Reset Request',
    greeting: `Hello ${userName},`,
    bodyLines: [
      'We received a request to reset the password for your NIB Bank KYC Portal account.',
      'Click the button below to choose a new password.',
    ],
    validityLine: 'This link is valid for <strong>24 hours</strong> and can only be used once.',
    callToActionLabel: 'Reset Your Password',
    callToActionUrl: resetLink,
    ignoreNote: 'If you did not request this, you can safely ignore this email or contact IT security.',
  });

  const mailOptions: SendMailOptions = {
    from: getFromHeader(config),
    to: userEmail,
    subject: template.subject,
    text: template.text,
    html: template.html,
  };

  return queueMail(mailOptions, {
    userEmail,
    userName,
    action: 'PASSWORD_RESET_REQUESTED',
    description: 'Self-service password reset email queued.',
  });
}

export function queueAccountSetupEmail(params: {
  userId?: string | null;
  userName: string;
  userEmail: string;
  username: string;
  setupLink: string;
}) {
  const config = getMailConfig();
  const baseUrl = config.loginUrl.replace(/\/$/, '');
  const subject = 'Set Up Your NIB Bank KYC Portal Password';

  const template = buildEmailTemplate({
    logoUrl: `${baseUrl}/logo.png`,
    subject,
    heading: 'Activate Your Account',
    greeting: `Hello ${params.userName},`,
    bodyLines: [
      'Your account has been created on the NIB Bank KYC Portal.',
      `Your username is: <strong>${params.username}</strong>`,
      'Click the button below to set your password and activate your account.',
    ],
    validityLine: 'This link is valid for <strong>24 hours</strong> and can only be used once.',
    callToActionLabel: 'Set Up My Password',
    callToActionUrl: params.setupLink,
    ignoreNote: 'If you did not expect this email, please contact your IT administrator immediately. Do not share this link with anyone.',
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
    action: 'ACCOUNT_SETUP',
    description: 'New user account setup email queued.',
  });
}

export function queueAdminResetSetupEmail(params: {
  userId?: string | null;
  userName: string;
  userEmail: string;
  username: string;
  setupLink: string;
}) {
  const config = getMailConfig();
  const baseUrl = config.loginUrl.replace(/\/$/, '');
  const subject = 'Your NIB Bank KYC Password Reset Request';

  const template = buildEmailTemplate({
    logoUrl: `${baseUrl}/logo.png`,
    subject,
    heading: 'Your Password Reset Request',
    greeting: `Hello ${params.userName},`,
    bodyLines: [
      'An administrator has initiated a password reset for your NIB Bank KYC Portal account.',
      'You can reset your password by clicking the link below.',
    ],
    validityLine: 'This link is valid for <strong>24 hours</strong>.',
    callToActionLabel: 'Reset Your Password',
    callToActionUrl: params.setupLink,
    ignoreNote: 'If you did not expect this reset, you can safely ignore this email or contact IT security.',
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
    action: 'ACCOUNT_SETUP',
    description: 'Admin-initiated password reset setup email queued.',
  });
}

