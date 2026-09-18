/**
 * Database configuration loader
 *
 * Priority:
 *   1. DATABASE_URL  (mysql://user:pass@host:port/dbname)
 *   2. DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
 *   3. $NOMAD_TASK_DIR/config.json  (legacy fallback, kept for local/old platform)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from 'node:process';

/**
 * Database credentials interface
 */
export interface DatabaseCredentials {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Parse a full connection string, e.g.
 * mysql://user:password@host:3306/dbname
 */
function fromConnectionUrl(url: string): DatabaseCredentials {
  const parsed = new URL(url);

  const database = parsed.pathname.replace(/^\//, '');
  if (!parsed.hostname || !database) {
    throw new Error('DATABASE_URL is missing a host or a database name');
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
  };
}

/**
 * Read the individual DB_* environment variables.
 * Returns null if none of them are set, so we can fall through to the file.
 */
function fromEnvVars(): DatabaseCredentials | null {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = env;

  if (!DB_HOST && !DB_USER && !DB_NAME) {
    return null;
  }

  const missing = [
    !DB_HOST && 'DB_HOST',
    !DB_USER && 'DB_USER',
    !DB_NAME && 'DB_NAME',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Missing required database environment variables: ${missing.join(', ')}`
    );
  }

  return {
    host: DB_HOST as string,
    port: DB_PORT ? parseInt(DB_PORT, 10) : 3306,
    user: DB_USER as string,
    password: DB_PASSWORD ?? '',
    database: DB_NAME as string,
  };
}

/**
 * Legacy loader: task-local config file ($NOMAD_TASK_DIR/config.json).
 * Returns null when the file does not exist.
 */
function fromConfigFile(): DatabaseCredentials | null {
  const configPath = join(env.NOMAD_TASK_DIR || '/local', 'config.json');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));

    if (!config.DATABASE?.VALUE) {
      throw new Error('Invalid config.json structure: DATABASE.VALUE not found');
    }

    const db = config.DATABASE.VALUE;

    if (!db.HOST || !db.PORT || !db.USERNAME || !db.PASSWORD || !db.NAME) {
      throw new Error('Invalid config.json: Missing required database credentials');
    }

    return {
      host: db.HOST,
      port: parseInt(String(db.PORT), 10),
      user: db.USERNAME,
      password: db.PASSWORD,
      database: db.NAME,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse ${configPath}: Invalid JSON format`);
    }
    throw error;
  }
}

/**
 * Load database configuration.
 *
 * @returns Database connection credentials
 * @throws Error if no source provides valid credentials
 */
export function getDatabaseCredentials(): DatabaseCredentials {
  if (env.DATABASE_URL) {
    return fromConnectionUrl(env.DATABASE_URL);
  }

  const fromEnv = fromEnvVars();
  if (fromEnv) {
    return fromEnv;
  }

  const fromFile = fromConfigFile();
  if (fromFile) {
    return fromFile;
  }

  throw new Error(
    'No database configuration found. Set DATABASE_URL, or DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME.'
  );
}

/**
 * Whether the connection should use SSL/TLS.
 * Most managed MySQL providers require it; set DB_SSL=false to disable.
 */
export function useSsl(): boolean {
  return (env.DB_SSL ?? 'true').toLowerCase() !== 'false';
}
