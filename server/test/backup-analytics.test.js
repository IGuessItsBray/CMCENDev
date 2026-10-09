const assert = require('node:assert/strict');
const test = require('node:test');
const { getBackupAnalyticsConfig } = require('../services/backup-analytics');

test('working Plausible reporting does not imply database backup credentials', () => {
  const config = getBackupAnalyticsConfig({
    PLAUSIBLE_DOMAIN: 'example.ca',
    PLAUSIBLE_API_URL: 'https://analytics.example.ca/api/event',
  });
  assert.equal(config.reportingConfigured, true);
  assert.equal(config.postgresUri, '');
  assert.equal(config.clickhouseUrl, '');
});
test('shared Plausible database connections supply backups and infer the ClickHouse database', () => {
  const config = getBackupAnalyticsConfig({
    PLAUSIBLE_DATABASE_URL: 'postgresql://reader:secret@db/analytics',
    PLAUSIBLE_CLICKHOUSE_DATABASE_URL:
      'http://reader:secret@events:8123/custom_events',
  });
  assert.equal(config.postgresUri, 'postgresql://reader:secret@db/analytics');
  assert.equal(config.clickhouseDatabase, 'custom_events');
  assert.equal(new URL(config.clickhouseUrl).pathname, '/');
});
test('backup-specific connections and database take precedence over shared settings', () => {
  const config = getBackupAnalyticsConfig({
    BACKUP_POSTGRES_URI: 'postgresql://backup/database',
    PLAUSIBLE_DATABASE_URL: 'postgresql://shared/other',
    BACKUP_CLICKHOUSE_URL: 'https://backup:8443/backup_events',
    PLAUSIBLE_CLICKHOUSE_DATABASE_URL: 'http://shared:8123/shared_events',
    BACKUP_CLICKHOUSE_DATABASE: 'explicit_events',
  });
  assert.equal(config.postgresUri, 'postgresql://backup/database');
  assert.equal(config.clickhouseUrl, 'https://backup:8443/backup_events');
  assert.equal(config.clickhouseDatabase, 'explicit_events');
});
