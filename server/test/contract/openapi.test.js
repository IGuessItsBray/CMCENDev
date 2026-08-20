const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { describe, test } = require('node:test');
const YAML = require('yaml');

const HTTP_METHODS = new Set([
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace',
]);

async function loadSchema() {
  const schemaPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'api',
    'schema',
    'openapi.yaml',
  );
  return YAML.parse(await readFile(schemaPath, 'utf8'));
}

function getOperations(schema) {
  return Object.entries(schema.paths || {}).flatMap(([route, pathItem]) =>
    Object.entries(pathItem || {})
      .filter(([method]) => HTTP_METHODS.has(method))
      .map(([method, operation]) => ({ route, method, operation })),
  );
}

describe('OpenAPI contract', () => {
  test('parses as OpenAPI 3 with documented operations and responses', async () => {
    const schema = await loadSchema();
    const operations = getOperations(schema);

    assert.match(schema.openapi, /^3\./u);
    assert.equal(operations.length > 0, true);

    for (const { route, method, operation } of operations) {
      assert.equal(
        Object.keys(operation.responses || {}).length > 0,
        true,
        `${method.toUpperCase()} ${route} must declare responses`,
      );
    }
  });

  test('uses unique operation IDs', async () => {
    const operations = getOperations(await loadSchema());
    const operationIds = operations
      .map(({ operation }) => operation.operationId)
      .filter(Boolean);

    assert.equal(new Set(operationIds).size, operationIds.length);
  });

  test('documents critical integration-tested endpoints', async () => {
    const schema = await loadSchema();
    const requiredOperations = [
      ['post', '/api/login'],
      ['post', '/api/contact'],
      ['post', '/api/session/refresh'],
      ['put', '/api/subscriptions/weekly-brief'],
      ['get', '/api/subscriptions/weekly-brief/unsubscribe'],
      ['post', '/api/subscriptions/weekly-brief/unsubscribe'],
      ['get', '/api/audit-logs'],
      ['get', '/api/audit-logs/export.csv'],
      ['post', '/api/upload'],
      ['post', '/api/admin/media/bulk-delete'],
      ['delete', '/api/profile'],
      ['delete', '/api/admin/users/{userId}'],
      ['delete', '/api/admin/last-posts/{lastPostId}'],
      ['post', '/api/events'],
      ['patch', '/api/events/{eventId}/review-content'],
      ['patch', '/api/events/{eventId}/review'],
      ['post', '/api/retirement-messages'],
      ['patch', '/api/retirement-messages/{messageId}/review-content'],
      ['patch', '/api/retirement-messages/{messageId}/review'],
      ['post', '/api/last-posts'],
      ['patch', '/api/last-posts/{messageId}/review-content'],
      ['patch', '/api/last-posts/{messageId}/review'],
    ];

    for (const [method, route] of requiredOperations) {
      assert.ok(
        schema.paths?.[route]?.[method],
        `${method.toUpperCase()} ${route} is undocumented`,
      );
    }
  });
});
