const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { resolveBuildCommit } = require('../scripts/quality/write-build-commit');

const commit = 'abcdef1234567890abcdef1234567890abcdef12';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcen-build-git-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('embeds the checked-out branch commit without Git or deployment arguments', (t) => {
  const directory = fixture(t);
  fs.mkdirSync(path.join(directory, 'refs/heads/feature'), { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'HEAD'),
    'ref: refs/heads/feature/footer\n',
  );
  fs.writeFileSync(
    path.join(directory, 'refs/heads/feature/footer'),
    commit + '\n',
  );
  assert.equal(resolveBuildCommit(directory), commit);
});

test('reads packed branch refs and detached HEAD checkouts', (t) => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, 'HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(
    path.join(directory, 'packed-refs'),
    `# pack-refs with: peeled\n${'1'.repeat(40)} refs/heads/other\n${commit} refs/heads/main\n`,
  );
  assert.equal(resolveBuildCommit(directory), commit);
  fs.writeFileSync(path.join(directory, 'HEAD'), commit + '\n');
  assert.equal(resolveBuildCommit(directory), commit);
});

test('explicit build arguments work without a Git directory', () => {
  assert.equal(resolveBuildCommit('/nonexistent', commit), commit);
  assert.throws(
    () => resolveBuildCommit('/nonexistent', 'unknown'),
    /Cannot determine/u,
  );
});

test('fails rather than embedding an unknown or unsafe reference', (t) => {
  const directory = fixture(t);
  assert.throws(() => resolveBuildCommit(directory));
  fs.writeFileSync(
    path.join(directory, 'HEAD'),
    'ref: refs/heads/../../secret\n',
  );
  assert.throws(() => resolveBuildCommit(directory), /Unsupported/u);
  fs.writeFileSync(path.join(directory, 'HEAD'), 'not a revision\n');
  assert.throws(() => resolveBuildCommit(directory), /Cannot determine/u);
});
