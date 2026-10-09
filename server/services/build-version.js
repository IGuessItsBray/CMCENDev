const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

function getBuildVersion(
  env = process.env,
  runGit = execFileSync,
  readBuildFile = readFileSync,
) {
  function embeddedCommit() {
    try {
      return (
        JSON.parse(
          readBuildFile(
            path.join(__dirname, '..', 'build-commit.json'),
            'utf8',
          ),
        ).commit || ''
      );
    } catch {
      return '';
    }
  }

  function git(args) {
    try {
      return runGit('git', args, {
        cwd: path.join(__dirname, '..', '..'),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  }

  const commit = String(
    env.COMMIT_SHA ||
      env.GIT_COMMIT ||
      env.RENDER_GIT_COMMIT ||
      env.VERCEL_GIT_COMMIT_SHA ||
      embeddedCommit() ||
      git(['rev-parse', 'HEAD']),
  ).trim();
  const release = String(
    env.RELEASE_VERSION ||
      git([
        'describe',
        '--tags',
        '--exact-match',
        '--match',
        'v[0-9]*',
        commit || 'HEAD',
      ]),
  ).trim();

  return {
    commit,
    shortCommit: commit ? commit.slice(0, 7) : '',
    // Package metadata is independent of the project's release tags.
    releaseVersion:
      /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(
        release,
      )
        ? `v${release.replace(/^v/u, '')}`
        : '',
  };
}

module.exports = { getBuildVersion };
