const { getPlausibleConfig, getPlausibleEmbedConfig } = require('./plausible');

function getBackupAnalyticsConfig(env) {
  const postgresUri =
    env.BACKUP_POSTGRES_URI || env.PLAUSIBLE_DATABASE_URL || '';
  let clickhouseUrl =
    env.BACKUP_CLICKHOUSE_URL || env.PLAUSIBLE_CLICKHOUSE_DATABASE_URL || '';
  let database = env.BACKUP_CLICKHOUSE_DATABASE;
  if (!database && clickhouseUrl) {
    try {
      database = decodeURIComponent(
        new URL(clickhouseUrl).pathname.replace(/^\//u, '').replace(/\/$/u, ''),
      );
    } catch {
      /* Export reports invalid configuration. */
    }
  }
  // Plausible stores the database in the URI path. HTTP exports use the root.
  if (!env.BACKUP_CLICKHOUSE_URL && clickhouseUrl) {
    try {
      const url = new URL(clickhouseUrl);
      url.pathname = '/';
      clickhouseUrl = url.toString();
    } catch {
      /* Export reports invalid configuration. */
    }
  }
  return {
    postgresUri,
    clickhouseUrl,
    clickhouseDatabase: database || 'plausible_events_db',
    reportingConfigured:
      getPlausibleConfig(env).enabled || getPlausibleEmbedConfig(env).enabled,
  };
}

module.exports = { getBackupAnalyticsConfig };
