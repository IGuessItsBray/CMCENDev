const fs = require('node:fs');
const path = require('node:path');

function resolveBuildCommit(gitDirectory, override = '') {
  let revision = override.trim();
  if (!revision) {
    revision = fs.readFileSync(path.join(gitDirectory, 'HEAD'), 'utf8').trim();
    if (revision.startsWith('ref: ')) {
      const ref = revision.slice(5);
      if (!/^refs\/heads\/[\w./-]+$/u.test(ref) || ref.includes('..')) {
        throw new Error('Unsupported Git HEAD reference; supply COMMIT_SHA');
      }
      try {
        revision = fs.readFileSync(path.join(gitDirectory, ref), 'utf8').trim();
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const refs = fs.readFileSync(
          path.join(gitDirectory, 'packed-refs'),
          'utf8',
        );
        revision =
          refs
            .split('\n')
            .find((line) => line.split(' ')[1] === ref)
            ?.split(' ')[0] || '';
      }
    }
  }
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(revision)) {
    throw new Error('Cannot determine the build commit; supply COMMIT_SHA');
  }
  return revision;
}

if (require.main === module) {
  try {
    const commit = resolveBuildCommit(process.argv[2], process.env.COMMIT_SHA);
    fs.writeFileSync(
      path.join(__dirname, '..', '..', 'build-commit.json'),
      JSON.stringify({ commit }) + '\n',
    );
  } catch {
    console.error(
      'Cannot embed the checkout commit. Build from a Git clone or supply --build-arg COMMIT_SHA=<full commit SHA> (required for worktrees and source archives).',
    );
    process.exitCode = 1;
  }
}

module.exports = { resolveBuildCommit };
