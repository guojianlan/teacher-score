import pino, { type LoggerOptions } from 'pino';

const REDACT_PATHS = [
  'password',
  'newPassword',
  'oldPassword',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'authorization',
  'apiKey',
  'api_key',
  'AI_API_KEY',
  'BETTER_AUTH_SECRET',
  'DATABASE_URL',
  'email',
  'studentName',
  'student.name',
  '*.password',
  '*.token',
  '*.apiKey',
  '*.email',
  '*.studentName',
  '*.student.name',
];

const isProduction = process.env.NODE_ENV === 'production';

const baseOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: {
    app: process.env.APP_NAME ?? 'teacher-score',
    env: process.env.NODE_ENV ?? 'development',
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

const devTransport: LoggerOptions['transport'] | undefined = isProduction
  ? undefined
  : {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', singleLine: false },
    };

export const logger = pino({
  ...baseOptions,
  ...(devTransport ? { transport: devTransport } : {}),
});

export type Logger = typeof logger;

export function createLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

export { initSentry, captureError } from './sentry';
