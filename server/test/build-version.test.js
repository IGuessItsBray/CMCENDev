const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getBuildVersion } = require('../services/build-version');

test('uses the embedded container commit when no runtime metadata is supplied', () => {
  const metadata = getBuildVersion(
    {},
    (_command, args) => {
      assert.equal(args[0], 'describe');
      throw new Error('Git unavailable in image');
    },
    () => JSON.stringify({ commit: 'abcdef1234567890' }),
  );
  assert.equal(metadata.commit, 'abcdef1234567890');
  assert.equal(metadata.shortCommit, 'abcdef1');
});

test('runtime commit metadata overrides the embedded image commit', () => {
  const metadata = getBuildVersion(
    { COMMIT_SHA: '1234567890', RELEASE_VERSION: 'v0.3.0' },
    () => assert.fail('Git should not be needed'),
    () => assert.fail('Embedded commit should not be needed'),
  );
  assert.equal(metadata.shortCommit, '1234567');
});

test('uses deployment metadata without requiring Git in release images', () => {
  const metadata = getBuildVersion(
    {
      COMMIT_SHA: ' abcdef1234567890 ',
      GIT_COMMIT: 'other',
      RELEASE_VERSION: '0.3.0-beta.2',
    },
    () => assert.fail('Git should not be needed'),
  );
  assert.deepEqual(metadata, {
    commit: 'abcdef1234567890',
    shortCommit: 'abcdef1',
    releaseVersion: 'v0.3.0-beta.2',
  });
});

test('infers the release from an exact tag on the running commit', () => {
  const calls = [];
  const metadata = getBuildVersion({}, (command, args) => {
    assert.equal(command, 'git');
    calls.push(args);
    return args[0] === 'rev-parse' ? '1234567890\n' : 'v0.3.0\n';
  });
  assert.equal(metadata.releaseVersion, 'v0.3.0');
  assert.deepEqual(calls[1], [
    'describe',
    '--tags',
    '--exact-match',
    '--match',
    'v[0-9]*',
    '1234567890',
  ]);
});

test('looks up the deployed commit rather than an unrelated checkout HEAD', () => {
  const metadata = getBuildVersion(
    { GIT_COMMIT: 'abcdef12345' },
    (_command, args) => {
      assert.equal(args.at(-1), 'abcdef12345');
      throw new Error('No release tag for development commit');
    },
  );
  assert.equal(metadata.shortCommit, 'abcdef1');
  assert.equal(metadata.releaseVersion, '');
});

test('handles missing Git and rejects invalid release metadata', () => {
  const noGit = () => {
    throw new Error('Git unavailable');
  };
  assert.deepEqual(getBuildVersion({}, noGit), {
    commit: '',
    shortCommit: '',
    releaseVersion: '',
  });
  assert.equal(
    getBuildVersion({ RELEASE_VERSION: 'main' }, noGit).releaseVersion,
    '',
  );
});
