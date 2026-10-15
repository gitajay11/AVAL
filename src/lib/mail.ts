import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const e = env();
  if (!e.SMTP_HOST) return (transporter = null);
  transporter = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
  });
  return transporter;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(heading: string, body: string, action?: { label: string; url: string }): string {
  const button = action
    ? `<p style="margin:28px 0"><a href="${escapeHtml(action.url)}" style="background:linear-gradient(135deg,#1d4ed8,#0f766e);color:#fff;text-decoration:none;padding:12px 22px;border-radius:14px;font-weight:600;display:inline-block">${escapeHtml(action.label)}</a></p>
       <p style="color:#4a5d70;font-size:13px">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(action.url)}</span></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f8fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0b1b2b">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:20px;padding:32px;box-shadow:0 8px 30px rgba(11,27,43,.08)">
    <div style="font-weight:800;font-size:20px;background:linear-gradient(135deg,#1d4ed8,#0f766e);-webkit-background-clip:text;color:#1d4ed8;-webkit-text-fill-color:transparent">Aval</div>
    <h1 style="font-size:20px;margin:20px 0 12px">${escapeHtml(heading)}</h1>
    <div style="font-size:15px;line-height:1.6">${body}</div>
    ${button}
  </div></body></html>`;
}

async function send(to: string, subject: string, html: string, text: string) {
  const t = getTransporter();
  if (!t) {
    // Development without SMTP: print instead of sending.
    console.info(`\n[mail] to=${to}\n[mail] subject=${subject}\n${text}\n`);
    return;
  }
  await t.sendMail({ from: env().SMTP_FROM, to, subject, html, text });
}

export function sendVerificationEmail(to: string, name: string, url: string) {
  return send(
    to,
    "Verify your email for Aval",
    layout(`Welcome, ${name}`, "<p>Confirm your email address to finish setting up your account. This link expires in 24 hours.</p>", {
      label: "Verify email",
      url,
    }),
    `Welcome to Aval, ${name}.\nVerify your email (expires in 24 hours): ${url}`,
  );
}

export function sendPasswordResetEmail(to: string, url: string) {
  return send(
    to,
    "Reset your Aval password",
    layout(
      "Reset your password",
      "<p>Someone asked to reset the password for this account. If that was you, use the button below. The link expires in 30 minutes.</p><p>If it wasn't you, you can ignore this email.</p>",
      { label: "Choose a new password", url },
    ),
    `Reset your Aval password (expires in 30 minutes): ${url}\nIf this wasn't you, ignore this email.`,
  );
}

export function sendPasswordChangedEmail(to: string) {
  return send(
    to,
    "Your Aval password was changed",
    layout(
      "Your password was changed",
      "<p>The password for your Aval account was just changed and other devices were signed out.</p><p>If this wasn't you, reset your password right away.</p>",
    ),
    "Your Aval password was changed and other devices were signed out. If this wasn't you, reset your password right away.",
  );
}
