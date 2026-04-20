// Email helper for sending password reset links.
// Supports SMTP configuration; gracefully logs to console if not configured.
// Never return plaintext tokens or passwords to clients.

import { logInstitutionalError } from './logger';

interface SendMailOptions {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendPasswordResetEmail(
  userEmail: string,
  resetLink: string,
  userName?: string
): Promise<boolean> {
  const smtpHost = process.env.SMTP_HOST;

  // If SMTP not configured, log reset link to console for development.
  if (!smtpHost) {
    return false;
  }

  try {
    // Dynamically require nodemailer to avoid adding it as hard dependency.
    // In production, operators should install: npm install nodemailer
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });

    const fromEmail = process.env.EMAIL_FROM || `noreply@nibbank.com.et`;

    const emailSubject = 'Password Reset Request';
    const greeting = userName ? `Hello ${userName},` : 'Hello,';
    const resetLinkText = resetLink;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #3E2B1E; color: #B89334; padding: 20px; text-align: center; border-radius: 4px; }
    .content { padding: 20px; background-color: #f5f5f5; margin: 20px 0; border-radius: 4px; }
    .button { display: inline-block; background-color: #B89334; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .warning { background-color: #fff3cd; border-left: 4px solid #B89334; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { text-align: center; font-size: 12px; color: #666; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Password Reset Request</h2>
    </div>
    <div class="content">
      <p>${greeting}</p>
      <p>A password reset was requested for your account. If you did not request this, please ignore this email.</p>
      <p>To reset your password, click the link below. <strong>This link will expire in 15 minutes.</strong></p>
      <a href="${resetLinkText}" class="button">Reset Password</a>
      <p>Or copy and paste this link in your browser:</p>
      <p><code>${resetLinkText}</code></p>
      <div class="warning">
        <strong>Security Notice:</strong> Never share this link with anyone. NIB Bank staff will never ask for your password.
      </div>
    </div>
    <div class="footer">
      <p>© 2026 NIB Bank. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;

    const textContent = `
Password Reset Request

${greeting}

A password reset was requested for your account. If you did not request this, please ignore this email.

To reset your password, visit this link (valid for 15 minutes):
${resetLinkText}

Security Notice: Never share this link with anyone. NIB Bank staff will never ask for your password.

© 2026 NIB Bank. All rights reserved.
    `.trim();

    const mailOptions: SendMailOptions = {
      from: fromEmail,
      to: userEmail,
      subject: emailSubject,
      text: textContent,
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    // Log error for operators but don't propagate to caller.
    // This prevents revealing SMTP configuration issues to users.
    logInstitutionalError(err, 'EMAIL_SEND_FAILED');
    return false;
  }
}
