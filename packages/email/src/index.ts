import { createLogger } from '@teacher-score/logger';

const log = createLogger({ scope: 'email' });

export interface SendEmailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface EmailTransport {
  send(input: SendEmailInput): Promise<void>;
}

class ConsoleTransport implements EmailTransport {
  async send(input: SendEmailInput): Promise<void> {
    log.info(
      {
        to: input.to,
        subject: input.subject,
        textPreview: input.text?.slice(0, 200),
      },
      '[email/console] sending',
    );
  }
}

class ResendTransport implements EmailTransport {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(input: SendEmailInput): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend send failed: ${res.status} ${body}`);
    }
  }
}

class SmtpTransport implements EmailTransport {
  constructor(
    private opts: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      from: string;
    },
  ) {}

  async send(input: SendEmailInput): Promise<void> {
    // Lazy import — nodemailer is optional. If not installed, fail clearly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('nodemailer' as any).catch(() => null);
    if (!mod) {
      throw new Error(
        'SMTP_HOST is set but `nodemailer` is not installed. Run: pnpm add nodemailer -F @teacher-score/email',
      );
    }
    const transporter = mod.default.createTransport({
      host: this.opts.host,
      port: this.opts.port,
      secure: this.opts.secure,
      auth: { user: this.opts.user, pass: this.opts.pass },
    });
    await transporter.sendMail({
      from: this.opts.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }
}

export function createEmailTransport(): EmailTransport {
  const from = process.env.EMAIL_FROM ?? 'no-reply@teacher-score.local';

  // SMTP takes precedence if configured (host + user + pass).
  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    return new SmtpTransport({
      host: smtpHost,
      port,
      // Convention: 465 = TLS from start; 587/25 = STARTTLS (secure=false).
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from,
    });
  }

  // Fallback: Resend HTTP API
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) return new ResendTransport(apiKey, from);

  // dev / unconfigured: never block local development
  return new ConsoleTransport();
}

export async function sendPasswordResetEmail(opts: { to: string; url: string }) {
  const transport = createEmailTransport();
  await transport.send({
    to: opts.to,
    subject: '[教师批改] 重置密码',
    text: `点击此链接重置密码：${opts.url}（链接 1 小时内有效）`,
    html: `<p>点击此链接重置密码：<a href="${opts.url}">${opts.url}</a></p><p>链接 1 小时内有效。</p>`,
  });
}

export async function sendVerificationEmail(opts: { to: string; url: string }) {
  const transport = createEmailTransport();
  await transport.send({
    to: opts.to,
    subject: '[教师批改] 验证邮箱',
    text: `点击此链接验证邮箱：${opts.url}`,
    html: `<p>点击此链接验证邮箱：<a href="${opts.url}">${opts.url}</a></p>`,
  });
}
