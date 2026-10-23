import util from 'node:util';
// eslint-disable-next-line import/no-extraneous-dependencies
import { app } from 'electron';
import { join } from 'node:path';
import type { Logger } from 'winston';


// https://mifi.no/blog/winston-electron-logger/

const logDirPath = app.isPackaged ? app.getPath('userData') : '.';
export const logFilePath = join(logDirPath, 'app.log');

type Level = 'info' | 'warn' | 'error';

/*
 * winston (the file log) takes about 45 ms to load, so it isn't loaded while the app starts: until
 * `loadFileLogger` runs (right after the window is created), messages go to the console at once and are kept,
 * with the time they were logged, to be written to the file then.
 */
let fileLogger: Logger | undefined;
let loading: Promise<void> | undefined;
const pending: { level: Level, message: string, timestamp: string }[] = [];

function log(level: Level, args: unknown[]) {
  const message = util.format(...args);
  const timestamp = new Date().toISOString();
  if (fileLogger != null) {
    fileLogger.log({ level, message, timestamp });
    return;
  }
  pending.push({ level, message, timestamp });
  const line = `${timestamp} ${level}: ${message}`;
  // eslint-disable-next-line no-console
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}

const logger = {
  info: (...args: unknown[]) => log('info', args),
  warn: (...args: unknown[]) => log('warn', args),
  error: (...args: unknown[]) => log('error', args),
};

export default logger;

export function loadFileLogger() {
  loading ??= (async () => {
    const { default: winston } = await import('winston');
    const created = winston.createLogger({
      format: winston.format.combine(
        // Messages kept from before this loaded carry the time they were logged.
        winston.format((info) => {
          // eslint-disable-next-line no-param-reassign
          info['timestamp'] ??= new Date().toISOString();
          return info;
        })(),
        winston.format.printf((info) => `${info['timestamp']} ${info.level}: ${info.message}`),
      ),
    });
    created.add(new winston.transports.Console());
    // At most 3 files of 1 MB: enough recent history to diagnose a problem without letting the log grow with use.
    created.add(new winston.transports.File({ level: 'debug', filename: logFilePath, options: { flags: 'a' }, maxsize: 1e6, maxFiles: 3, tailable: true }));
    for (const entry of pending.splice(0)) created.log(entry);
    fileLogger = created;
  })();
  return loading;
}

/** Before quitting early (a failed start, a second instance): every message written to the file. */
export async function flushFileLogger() {
  await loadFileLogger();
  const created = fileLogger;
  if (created == null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2000);
    created.on('finish', () => {
      clearTimeout(timer);
      resolve();
    });
    created.end();
  });
}
