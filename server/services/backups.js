const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Readable, PassThrough } = require('node:stream');
const { writeAuditLog } = require('./audit-log');
const scrypt = promisify(crypto.scrypt);
const MAGIC = Buffer.from('CMCENBK1');
const ID = /^backup-[0-9]+-[a-f0-9]{16}$/u;

function backupError(message, status = 503) {
  return Object.assign(new Error(message), { status });
}

// Each file: magic(8), salt(16), IV(12), ciphertext, GCM tag(16).
async function encryptStream(source, destination, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await scrypt(password, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  await fs.writeFile(destination, Buffer.concat([MAGIC, salt, iv]), {
    mode: 0o600,
    flag: 'wx',
  });
  try {
    await pipeline(
      source,
      cipher,
      createWriteStream(destination, { flags: 'a' }),
    );
    await fs.appendFile(destination, cipher.getAuthTag());
  } finally {
    key.fill(0);
  }
}

// Authenticate before publishing plaintext; this helper is for offline recovery.
async function decryptFile(source, destination, password) {
  const handle = await fs.open(source, 'r');
  const temporary = `${destination}.${crypto.randomBytes(8).toString('hex')}.partial`;
  try {
    const { size } = await handle.stat();
    if (size < 52) throw new Error('Invalid backup');
    const header = Buffer.alloc(36);
    const tag = Buffer.alloc(16);
    await handle.read(header, 0, 36, 0);
    await handle.read(tag, 0, 16, size - 16);
    if (!header.subarray(0, 8).equals(MAGIC)) throw new Error('Invalid backup');
    const key = await scrypt(password, header.subarray(8, 24), 32);
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        header.subarray(24, 36),
      );
      decipher.setAuthTag(tag);
      await pipeline(
        size === 52
          ? Readable.from([])
          : createReadStream(source, { start: 36, end: size - 17 }),
        decipher,
        createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
      );
      // link is exclusive: never overwrite an existing recovery file.
      await fs.link(temporary, destination);
    } finally {
      key.fill(0);
    }
  } finally {
    await handle.close();
    await fs.rm(temporary, { force: true });
  }
}

async function dump(command, args, env, destination, password) {
  const child = spawn(command, args, {
    env,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const completion = new Promise((resolve, reject) => {
    child.once('error', () =>
      reject(backupError('Database dump tool could not start')),
    );
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(backupError('Database dump failed')),
    );
  });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 30 * 60 * 1000);
  // ChildProcess drains stdout after exit. Capture it immediately so a fast
  // dump cannot lose its bytes while encryptStream awaits key derivation.
  const output = new PassThrough();
  const capture = pipeline(child.stdout, output);
  try {
    const tasks = [
      completion,
      capture,
      encryptStream(output, destination, password).catch((error) => {
        output.destroy();
        throw error;
      }),
    ].map((task) =>
      task.catch((error) => {
        child.kill('SIGKILL');
        throw error;
      }),
    );
    const results = await Promise.allSettled(tasks);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
  } catch (error) {
    child.kill('SIGKILL');
    await completion.catch(() => {});
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function backupClickHouse(env, directory, request = fetch) {
  const url = new URL(env.BACKUP_CLICKHOUSE_URL);
  if (!['http:', 'https:'].includes(url.protocol))
    throw backupError('Invalid ClickHouse configuration');
  const headers = {
    'X-ClickHouse-User': decodeURIComponent(url.username || 'default'),
    'X-ClickHouse-Key': decodeURIComponent(url.password),
  };
  url.username = '';
  url.password = '';
  url.search = '';
  url.searchParams.set('wait_end_of_query', '1');
  url.searchParams.set('max_execution_time', '1800');
  const identifier = (value) =>
    `\`${value.replace(/\\/gu, '\\\\').replace(/`/gu, '\\`')}\``;
  const database = env.BACKUP_CLICKHOUSE_DATABASE || 'plausible_events_db';
  async function query(sql) {
    const response = await request(url, {
      method: 'POST',
      headers,
      body: sql,
      redirect: 'error',
      signal: AbortSignal.timeout(30 * 60 * 1000),
    });
    if (!response.ok || response.headers.get('X-ClickHouse-Exception-Code')) {
      await response.body?.cancel();
      throw backupError('ClickHouse export failed');
    }
    return response;
  }
  async function json(sql) {
    const response = await query(sql);
    const chunks = [];
    let size = 0;
    for await (const chunk of Readable.fromWeb(response.body)) {
      size += chunk.length;
      if (size > 16 * 1024 * 1024)
        throw backupError('ClickHouse schema too large');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')).data;
  }
  const databaseSchema = await json(
    `SHOW CREATE DATABASE ${identifier(database)} FORMAT JSON`,
  );
  // Parameter binding keeps configured database names out of SQL literals.
  url.searchParams.set('param_database', database);
  const tables = await json(
    'SELECT name, engine, create_table_query FROM system.tables WHERE database = {database:String} ORDER BY name FORMAT JSON',
  );
  const files = ['clickhouse-schema.enc'];
  for (const [index, table] of tables.entries()) {
    if (['View', 'MaterializedView', 'Dictionary'].includes(table.engine))
      continue;
    table.file = `clickhouse-${String(index).padStart(6, '0')}.enc`;
    const response = await query(
      `SELECT * FROM ${identifier(database)}.${identifier(table.name)} FORMAT Native`,
    );
    await encryptStream(
      Readable.fromWeb(response.body),
      path.join(directory, table.file),
      env.BACKUP_ENCRYPTION_PASSWORD,
    );
    files.push(table.file);
  }
  await encryptStream(
    Readable.from([JSON.stringify({ database, databaseSchema, tables })]),
    path.join(directory, 'clickhouse-schema.enc'),
    env.BACKUP_ENCRYPTION_PASSWORD,
  );
  return files;
}

function createBackupService({
  env = process.env,
  dumpDatabase = dump,
  audit = writeAuditLog,
  clickHouseRequest = fetch,
} = {}) {
  const directory = path.resolve(
    env.BACKUP_DIRECTORY || path.join(__dirname, '../data/backups'),
  );
  // Never allow encrypted databases or credential files in the static web root.
  const publicRoot = path.resolve(__dirname, '../public');
  if (
    directory === publicRoot ||
    directory.startsWith(`${publicRoot}${path.sep}`)
  ) {
    throw backupError('Backup directory must be outside the public directory');
  }
  const statePath = path.join(directory, 'schedule.json');
  const lockPath = path.join(directory, '.lock');
  const defaults = {
    enabled: false,
    intervalMinutes: 1440,
    lastAttemptAt: null,
    lastResult: null,
  };
  let timer;
  let checking = false;

  async function initialize() {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  }
  async function readState() {
    try {
      return {
        ...defaults,
        ...JSON.parse(await fs.readFile(statePath, 'utf8')),
      };
    } catch (error) {
      if (error.code === 'ENOENT') return { ...defaults };
      throw error;
    }
  }
  async function saveState(state) {
    const temporary = `${statePath}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(state), {
        mode: 0o600,
        flag: 'wx',
      });
      await fs.rename(temporary, statePath);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  async function lock() {
    await initialize();
    try {
      return await fs.open(lockPath, 'wx', 0o600);
    } catch (error) {
      if (error.code === 'EEXIST')
        throw backupError(
          'Backup operation already running or recovery lock present',
          409,
        );
      throw error;
    }
  }
  async function unlock(handle) {
    await handle.close();
    await fs.unlink(lockPath);
  }
  function readiness() {
    return {
      encryptionConfigured: Boolean(
        env.BACKUP_ENCRYPTION_PASSWORD?.length >= 16,
      ),
      mongoConfigured: Boolean(env.MONGO_URI),
      postgresConfigured: Boolean(env.BACKUP_POSTGRES_URI),
      clickhouseConfigured: Boolean(env.BACKUP_CLICKHOUSE_URL),
    };
  }
  async function status() {
    await initialize();
    const state = await readState();
    const backups = [];
    const entries = (await fs.readdir(directory))
      .filter((id) => ID.test(id))
      .sort()
      .reverse()
      .slice(0, 100);
    for (const id of entries) {
      backups.push(
        JSON.parse(
          await fs.readFile(path.join(directory, id, 'manifest.json'), 'utf8'),
        ),
      );
    }
    let running = false;
    try {
      await fs.access(lockPath);
      running = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return {
      ...state,
      readiness: readiness(),
      running,
      backups,
      nextRunAt: state.enabled
        ? new Date(
            (state.lastAttemptAt
              ? Date.parse(state.lastAttemptAt)
              : Date.now()) +
              state.intervalMinutes * 60000,
          ).toISOString()
        : null,
    };
  }
  async function configure(input, req) {
    if (
      !input ||
      typeof input.enabled !== 'boolean' ||
      !Number.isInteger(input.intervalMinutes) ||
      input.intervalMinutes < 60 ||
      input.intervalMinutes > 525600 ||
      Object.keys(input).some(
        (key) => !['enabled', 'intervalMinutes'].includes(key),
      )
    ) {
      throw backupError(
        'Use enabled and an integer intervalMinutes between 60 and 525600',
        400,
      );
    }
    if (
      input.enabled &&
      (!readiness().encryptionConfigured || !readiness().mongoConfigured)
    ) {
      throw backupError(
        'Configure a backup password of at least 16 characters and MongoDB first',
      );
    }
    const handle = await lock();
    try {
      const state = await readState();
      await saveState({
        ...state,
        ...input,
        lastAttemptAt: new Date().toISOString(),
      });
      await audit({
        req,
        actor: req?.user,
        action: 'backup.schedule_changed',
        targetType: 'backup',
        metadata: input,
      });
    } finally {
      await unlock(handle);
    }
    return status();
  }
  async function run(req = null, scheduled = false) {
    if (!readiness().encryptionConfigured || !readiness().mongoConfigured)
      throw backupError(
        'Configure a backup password of at least 16 characters and MongoDB first',
      );
    const handle = await lock();
    let temporary;
    let credentialDirectory;
    let id;
    try {
      const state = await readState();
      const now = Date.now();
      if (
        scheduled &&
        (!state.enabled ||
          now <
            Date.parse(state.lastAttemptAt || 0) +
              state.intervalMinutes * 60000)
      )
        return;
      id = `backup-${now}-${crypto.randomBytes(8).toString('hex')}`;
      await saveState({
        ...state,
        lastAttemptAt: new Date(now).toISOString(),
        lastResult: 'running',
      });
      await audit({
        req,
        actor: req?.user,
        action: 'backup.started',
        targetType: 'backup',
        metadata: { id, scheduled },
      });
      temporary = path.join(directory, `.${id}.partial`);
      await fs.mkdir(temporary, { mode: 0o700 });
      credentialDirectory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'cmcen-backup-'),
      );
      const mongoConfig = path.join(credentialDirectory, 'mongo.yml');
      await fs.writeFile(
        mongoConfig,
        `uri: ${JSON.stringify(env.MONGO_URI)}\n`,
        { mode: 0o600, flag: 'wx' },
      );
      // Pass only required environment to child processes; never the encryption key.
      const childEnv = {
        PATH: env.PATH || process.env.PATH,
        HOME: os.homedir(),
        LANG: 'C.UTF-8',
      };
      await dumpDatabase(
        'mongodump',
        ['--config', mongoConfig, '--archive', '--gzip'],
        childEnv,
        path.join(temporary, 'mongo.enc'),
        env.BACKUP_ENCRYPTION_PASSWORD,
      );
      const files = ['mongo.enc'];
      if (env.BACKUP_POSTGRES_URI) {
        const uri = new URL(env.BACKUP_POSTGRES_URI);
        if (!['postgres:', 'postgresql:'].includes(uri.protocol))
          throw backupError('Invalid PostgreSQL backup configuration');
        const password = decodeURIComponent(uri.password);
        uri.password = '';
        await dumpDatabase(
          'pg_dump',
          ['--format=custom', '--no-password'],
          {
            ...childEnv,
            PGDATABASE: uri.toString(),
            PGPASSWORD: password,
            PGCONNECT_TIMEOUT: '30',
          },
          path.join(temporary, 'postgres.enc'),
          env.BACKUP_ENCRYPTION_PASSWORD,
        );
        files.push('postgres.enc');
      }
      if (env.BACKUP_CLICKHOUSE_URL)
        files.push(
          ...(await backupClickHouse(env, temporary, clickHouseRequest)),
        );
      const manifest = {
        id,
        createdAt: new Date(now).toISOString(),
        completedAt: new Date().toISOString(),
        files,
        scheduled,
        format: 'CMCENBK1',
      };
      await fs.writeFile(
        path.join(temporary, 'manifest.json'),
        JSON.stringify(manifest),
        { mode: 0o600 },
      );
      await fs.rename(temporary, path.join(directory, id));
      temporary = null;
      await saveState({
        ...state,
        lastAttemptAt: new Date(now).toISOString(),
        lastResult: 'succeeded',
      });
      await audit({
        req,
        actor: req?.user,
        action: 'backup.completed',
        targetType: 'backup',
        metadata: { id, scheduled, files },
      });
      return manifest;
    } catch {
      if (id) {
        const state = await readState();
        await saveState({ ...state, lastResult: 'failed' });
        await audit({
          req,
          actor: req?.user,
          action: 'backup.failed',
          targetType: 'backup',
          metadata: { id, scheduled },
        });
      }
      throw backupError(
        'Backup failed; check database connectivity, dump tools, and writable storage',
      );
    } finally {
      try {
        if (temporary) await fs.rm(temporary, { recursive: true, force: true });
        if (credentialDirectory)
          await fs.rm(credentialDirectory, { recursive: true, force: true });
      } finally {
        await unlock(handle);
      }
    }
  }
  function start() {
    if (timer) return;
    const tick = async () => {
      if (checking) return;
      checking = true;
      try {
        const state = await readState();
        if (state.enabled) await run(null, true);
      } catch (error) {
        if (error.status !== 409) console.error('Scheduled backup unavailable');
      } finally {
        checking = false;
      }
    };
    timer = setInterval(() => void tick(), 60000);
    timer.unref();
    void tick();
  }
  function stop() {
    clearInterval(timer);
    timer = null;
  }
  function filePath(id, file) {
    if (
      !ID.test(id) ||
      !/^(mongo|postgres|clickhouse-schema|clickhouse-[0-9]{6})\.enc$/u.test(
        file,
      )
    )
      throw backupError('Backup not found', 404);
    return path.join(directory, id, file);
  }
  return { status, configure, run, start, stop, filePath };
}

module.exports = { createBackupService, encryptStream, decryptFile };
