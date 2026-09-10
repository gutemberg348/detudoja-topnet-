import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

function canSendEmail() {
  return Boolean(
    env.smtp.from
    && env.smtp.host
    && env.smtp.password
    && env.smtp.user,
  );
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendPasswordResetEmail({ email, name, resetUrl }) {
  if (!canSendEmail()) {
    if (env.nodeEnv !== "production") {
      console.info(`[auth] Link local de recuperacao para ${email}: ${resetUrl}`);
    } else {
      console.error("[auth] SMTP nao configurado; link de recuperacao nao enviado.");
    }

    return { delivered: false, mode: "development-log" };
  }

  const transporter = nodemailer.createTransport({
    auth: { pass: env.smtp.password, user: env.smtp.user },
    disableFileAccess: true,
    disableUrlAccess: true,
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
  });
  const safeName = escapeHtml(name || "voce");
  const safeUrl = escapeHtml(resetUrl);

  try {
    await transporter.sendMail({
      from: env.smtp.from,
      html: `
        <div style="font-family:Arial,sans-serif;color:#142019;max-width:560px;margin:auto;padding:24px">
          <h1 style="font-size:24px;margin:0 0 12px">Redefina sua senha</h1>
          <p>Ola, ${safeName}. Recebemos um pedido para trocar sua senha no Brasil Cashback.</p>
          <p style="margin:28px 0">
            <a href="${safeUrl}" style="background:#16A34A;border-radius:8px;color:#fff;display:inline-block;font-weight:700;padding:14px 22px;text-decoration:none">Criar nova senha</a>
          </p>
          <p style="color:#5E6D64">Este link expira em ${env.passwordReset.expiresMinutes} minutos e pode ser usado uma unica vez.</p>
          <p style="color:#5E6D64">Se voce nao pediu a troca, ignore este e-mail.</p>
        </div>
      `,
      subject: "Redefina sua senha no Brasil Cashback",
      text: `Ola, ${name || "voce"}. Redefina sua senha: ${resetUrl}. O link expira em ${env.passwordReset.expiresMinutes} minutos.`,
      to: email,
    });

    return { delivered: true, mode: "smtp" };
  } catch (error) {
    console.error("[auth] Falha ao enviar e-mail de recuperacao", error);
    return { delivered: false, mode: "smtp-error" };
  }
}
