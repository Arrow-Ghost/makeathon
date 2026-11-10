import nodemailer from 'nodemailer';
import { HttpError, isProduction } from './http.js';

let transport;

// SMTP works with Gmail (an app password), Zoho, Brevo, Resend, SES and most providers.
function smtp() {
  const port = Number(process.env.SMTP_PORT || 465);
  return (transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  }));
}

export async function sendCode(email, code) {
  if (!process.env.SMTP_HOST) {
    if (isProduction()) throw new HttpError(503, 'Email is not set up on the server yet. Please try again later.');
    // Local development without SMTP: read the code from the server console.
    console.log(`[dev] Makeathon sign-in code for ${email}: ${code}`);
    return;
  }
  try {
    await smtp().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: `${code} is your Makeathon 2027 code`,
      text: `Your Makeathon 2027 verification code is ${code}.\n\nIt expires in 10 minutes. If you did not ask for it, you can ignore this email.\n\nSELECT, VIT Vellore`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:460px;margin:0 auto;padding:28px;background:#17261F;color:#EDF1EF">
<div style="font-size:13px;letter-spacing:3px;color:#F2B84B">MAKEATHON 2027</div>
<p style="font-size:16px;line-height:1.5;margin:18px 0 10px">Your verification code is</p>
<div style="font-family:'Courier New',monospace;font-size:34px;letter-spacing:10px;font-weight:bold;color:#F2B84B">${code}</div>
<p style="font-size:14px;line-height:1.5;color:#C1CBC6;margin:18px 0 0">It expires in 10 minutes. If you did not ask for it, you can ignore this email.</p>
</div>`,
    });
  } catch (error) {
    console.error('mail failed:', error?.code || error?.name || 'unknown error');
    throw new HttpError(502, 'We could not send the email. Check the address and try again.');
  }
}
