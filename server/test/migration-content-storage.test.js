const test = require('node:test');
const assert = require('node:assert/strict');
const {
  contentObjectStore,
} = require('../scripts/migration/lib/content-import-storage');

function failingStore(name, httpStatusCode) {
  const error = Object.assign(new Error('synthetic storage failure'), {
    name,
    $metadata: { httpStatusCode },
  });
  let calls = 0;
  const store = contentObjectStore({
    client: {
      send: async (command) => {
        calls++;
        assert.equal(command.constructor.name, 'GetObjectCommand');
        assert.deepEqual(command.input, {
          Bucket: 'synthetic-archive',
          Key: 'images/archive/test.png',
        });
        throw error;
      },
    },
    bucket: 'synthetic-archive',
    endpoint: 'https://storage.example',
    publicOrigin: 'https://media.example',
  });
  return { store, error, calls: () => calls };
}

test('storage adapter recognizes explicit NoSuchKey as object absence', async () => {
  const { store, calls } = failingStore('NoSuchKey', 404);
  assert.equal(await store.get('images/archive/test.png', 1), null);
  assert.equal(calls(), 1);
});

test('storage adapter fails closed for missing bucket and ambiguous 404', async (t) => {
  for (const name of [
    'NoSuchBucket',
    'NotFound',
    'UnknownError',
    'AccessDenied',
  ]) {
    await t.test(name, async () => {
      const { store, error, calls } = failingStore(name, 404);
      await assert.rejects(
        store.get('images/archive/test.png', 1),
        (actual) => actual === error,
      );
      assert.equal(calls(), 1);
    });
  }
});
