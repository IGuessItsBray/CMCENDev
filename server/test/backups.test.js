const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const {
  createBackupService,
  encryptStream,
  decryptFile,
} = require('../services/backups');
const { getUserPermissions } = require('../config/permissions');

const password = 'a long test password for backups';
async function fixture(t, extras = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const events = [];
  const env = {
    MONGO_URI: 'mongodb://localhost/test',
    BACKUP_DIRECTORY: directory,
    BACKUP_ENCRYPTION_PASSWORD: password,
    ...extras.env,
  };
  const service = createBackupService({
    audit: async (event) => events.push(event),
    dumpDatabase: async (command, args, childEnv, file, key) => {
      assert.equal(childEnv.BACKUP_ENCRYPTION_PASSWORD, undefined);
      assert.equal(
        args.some((arg) => arg.includes('secret')),
        false,
      );
      if (command === 'mongodump')
        assert.match(await fs.readFile(args[1], 'utf8'), /uri:/u);
      await encryptStream(Readable.from([`${command}:data`]), file, key);
    },
    ...extras,
    env,
  });
  return { directory, service, events, env };
}

test('encryption authenticates password and tampering without publishing failed plaintext', async (t) => {
  const { directory } = await fixture(t);
  const encrypted = path.join(directory, 'dump.enc');
  const output = path.join(directory, 'out');
  await encryptStream(
    Readable.from(['private database data']),
    encrypted,
    password,
  );
  assert.equal(
    (await fs.readFile(encrypted)).includes('private database data'),
    false,
  );
  await assert.rejects(decryptFile(encrypted, output, 'wrong password'));
  await assert.rejects(fs.access(output));
  await decryptFile(encrypted, output, password);
  assert.equal(await fs.readFile(output, 'utf8'), 'private database data');
  await assert.rejects(decryptFile(encrypted, output, password));
  const bytes = await fs.readFile(encrypted);
  bytes[40] ^= 1;
  await fs.writeFile(encrypted, bytes);
  await assert.rejects(decryptFile(encrypted, `${output}2`, password));
  await assert.rejects(fs.access(`${output}2`));
});

test('empty native exports decrypt successfully', async (t) => {
  const { directory } = await fixture(t);
  await encryptStream(
    Readable.from([]),
    path.join(directory, 'empty.enc'),
    password,
  );
  await decryptFile(
    path.join(directory, 'empty.enc'),
    path.join(directory, 'empty'),
    password,
  );
  assert.equal((await fs.stat(path.join(directory, 'empty'))).size, 0);
});

test('only developers can have backup permission, even with custom grants', () => {
  for (const role of ['ghost', 'subscriber', 'editor', 'administrator']) {
    const permissions = getUserPermissions({
      role,
      customRoles: [{ permissions: ['backups.manage'] }],
    });
    assert.equal(permissions.canManageBackups, false);
    assert.equal(permissions.keys.includes('backups.manage'), false);
  }
  assert.equal(
    getUserPermissions({ role: 'developer' }).canManageBackups,
    true,
  );
});

test('schedule validates input, stays disabled by default, and persists across service instances', async (t) => {
  const { service, directory, env, events } = await fixture(t);
  assert.equal((await service.status()).enabled, false);
  for (const input of [
    { enabled: 'true', intervalMinutes: 60 },
    { enabled: true, intervalMinutes: 59 },
    { enabled: true, intervalMinutes: 525601 },
    { enabled: true, intervalMinutes: 60, password: 'x' },
  ]) {
    await assert.rejects(service.configure(input), { status: 400 });
  }
  await service.configure({ enabled: true, intervalMinutes: 120 });
  const restored = createBackupService({ env, audit: async () => {} });
  assert.equal((await restored.status()).intervalMinutes, 120);
  assert.equal(events[0].action, 'backup.schedule_changed');
  await service.run(null, true);
  assert.equal((await service.status()).backups.length, 0);
  const state = JSON.parse(
    await fs.readFile(path.join(directory, 'schedule.json'), 'utf8'),
  );
  state.lastAttemptAt = new Date(Date.now() - 121 * 60000).toISOString();
  await fs.writeFile(
    path.join(directory, 'schedule.json'),
    JSON.stringify(state),
  );
  await service.run(null, true);
  await service.run(null, true);
  assert.equal((await service.status()).backups.length, 1);
});

test('missing password fails closed and path traversal is rejected', async (t) => {
  const { service } = await fixture(t, {
    env: { BACKUP_ENCRYPTION_PASSWORD: '' },
  });
  await assert.rejects(service.run(), { status: 503 });
  await assert.rejects(
    service.configure({ enabled: true, intervalMinutes: 60 }),
    { status: 503 },
  );
  assert.throws(() => service.filePath('../public', 'mongo.enc'), {
    status: 404,
  });
  assert.throws(
    () => service.filePath('backup-1-0123456789abcdef', '../schedule.json'),
    { status: 404 },
  );
  assert.throws(() =>
    createBackupService({
      env: { BACKUP_DIRECTORY: path.resolve(__dirname, '../public/backups') },
    }),
  );
});

test('MongoDB and optional PostgreSQL exports publish only after success, with sanitized audits', async (t) => {
  const { service, events } = await fixture(t, {
    env: {
      BACKUP_POSTGRES_URI: 'postgresql://user:secret@localhost/analytics',
    },
  });
  const manifest = await service.run();
  assert.deepEqual(manifest.files, ['mongo.enc', 'postgres.enc']);
  const status = await service.status();
  assert.equal(status.lastResult, 'succeeded');
  assert.equal(status.backups.length, 1);
  assert.equal(JSON.stringify(status).includes(password), false);
  assert.equal(JSON.stringify(events).includes('secret'), false);
});

test('failed exports clean up and never publish partial backups', async (t) => {
  const { service, directory, events } = await fixture(t, {
    dumpDatabase: async () => {
      throw new Error('secret database error');
    },
  });
  await assert.rejects(service.run(), { status: 503 });
  const status = await service.status();
  assert.equal(status.running, false);
  assert.equal(status.lastResult, 'failed');
  assert.deepEqual(status.backups, []);
  assert.deepEqual(await fs.readdir(directory), ['schedule.json']);
  assert.equal(events.at(-1).action, 'backup.failed');
  assert.equal(JSON.stringify(events).includes('secret'), false);
});

test('shared storage prevents overlapping operations and schedule changes', async (t) => {
  let release;
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const { service, env } = await fixture(t, {
    dumpDatabase: async () => {
      started();
      await waiting;
    },
  });
  const running = service.run();
  await ready;
  const second = createBackupService({ env, audit: async () => {} });
  try {
    await assert.rejects(second.run(), { status: 409 });
    await assert.rejects(
      second.configure({ enabled: false, intervalMinutes: 60 }),
      { status: 409 },
    );
    assert.equal((await second.status()).running, true);
  } finally {
    release();
    await running;
  }
});

test('ClickHouse includes encrypted schema and native data, credentials stay in headers', async (t) => {
  const queries = [];
  const { service, directory } = await fixture(t, {
    env: { BACKUP_CLICKHOUSE_URL: 'http://reader:secret@localhost:8123' },
    clickHouseRequest: async (url, options) => {
      assert.equal(url.password, '');
      assert.equal(options.headers['X-ClickHouse-Key'], 'secret');
      assert.equal(url.searchParams.get('wait_end_of_query'), '1');
      queries.push(options.body);
      if (options.body.startsWith('SHOW'))
        return Response.json({
          data: [{ statement: 'CREATE DATABASE plausible_events_db' }],
        });
      if (options.body.includes('system.tables'))
        return Response.json({
          data: [
            {
              name: 'events',
              engine: 'MergeTree',
              create_table_query: 'CREATE TABLE events',
            },
            {
              name: 'view',
              engine: 'View',
              create_table_query: 'CREATE VIEW view',
            },
          ],
        });
      return new Response('native data');
    },
  });
  const manifest = await service.run();
  assert.deepEqual(manifest.files, [
    'mongo.enc',
    'clickhouse-schema.enc',
    'clickhouse-000000.enc',
  ]);
  await decryptFile(
    service.filePath(manifest.id, 'clickhouse-schema.enc'),
    path.join(directory, 'schema.json'),
    password,
  );
  const schema = JSON.parse(
    await fs.readFile(path.join(directory, 'schema.json'), 'utf8'),
  );
  assert.equal(schema.tables[0].file, 'clickhouse-000000.enc');
  assert.equal(schema.tables[1].file, undefined);
  assert.equal(queries.length, 3);
});

test('ClickHouse failure prevents publishing otherwise successful MongoDB export', async (t) => {
  const { service } = await fixture(t, {
    env: { BACKUP_CLICKHOUSE_URL: 'http://localhost:8123' },
    clickHouseRequest: async () =>
      new Response('private error', { status: 500 }),
  });
  await assert.rejects(service.run(), { status: 503 });
  assert.deepEqual((await service.status()).backups, []);
});

test('dump subprocess streams into encryption and rejects a nonzero exit without publication', async (t) => {
  const { directory, service, env } = await fixture(t, {
    dumpDatabase: undefined,
  });
  env.PATH = directory;
  const executable = path.join(directory, 'mongodump');
  await fs.writeFile(
    executable,
    '#!/bin/sh\nprintf "mock database archive"\n',
    { mode: 0o700 },
  );
  const manifest = await service.run();
  const output = path.join(directory, 'recovered');
  await decryptFile(
    service.filePath(manifest.id, 'mongo.enc'),
    output,
    password,
  );
  assert.equal(await fs.readFile(output, 'utf8'), 'mock database archive');
  await fs.writeFile(
    executable,
    '#!/bin/sh\nprintf "partial archive"\nexit 1\n',
    { mode: 0o700 },
  );
  await assert.rejects(service.run(), { status: 503 });
  assert.equal((await service.status()).backups.length, 1);
  await fs.unlink(executable);
  await assert.rejects(service.run(), { status: 503 });
  assert.equal((await service.status()).running, false);
});

test(
  'an encryption write failure cancels a buffered dump and releases the backup lock',
  { timeout: 5000 },
  async (t) => {
    const { directory, service, env } = await fixture(t, {
      dumpDatabase: undefined,
    });
    env.PATH = directory;
    const executable = path.join(directory, 'mongodump');
    await fs.writeFile(
      executable,
      `#!${process.execPath}
process.stdout.write(Buffer.alloc(1024 * 1024));
`,
      { mode: 0o700 },
    );
    const writeFile = fs.writeFile;
    t.mock.method(fs, 'writeFile', async (filename, ...args) => {
      if (String(filename).endsWith(`${path.sep}mongo.enc`)) {
        // Allow stdout to fill the capture stream before simulating disk full.
        await new Promise((resolve) => setTimeout(resolve, 200));
        throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
      }
      return writeFile(filename, ...args);
    });
    await assert.rejects(service.run(), { status: 503 });
    const status = await service.status();
    assert.equal(status.running, false);
    assert.equal(status.lastResult, 'failed');
    assert.deepEqual(status.backups, []);
  },
);
