const { spawn } = require('child_process');
const path = require('path');

const testFile = path.join(__dirname, '..', '..', 'test', 'integration', 'api.test.js');
const groups = [
  'system and authentication|MFA and audit behavior|database integrity',
  'public search|permissions and audit logs|news stories|authorization matrix and account integrity',
  'retirement message lifecycle|Last Post lifecycle',
  'event, page, and comment workflows|media lifecycle',
];

const runs = groups.map(
  (pattern) =>
    new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        ['--test', `--test-name-pattern=${pattern}`, testFile],
        { stdio: 'inherit' },
      );
      child.once('exit', (code, signal) => resolve({ code, signal }));
      child.once('error', () => resolve({ code: 1 }));
    }),
);

Promise.all(runs).then((results) => {
  if (results.some(({ code, signal }) => code !== 0 || signal)) {
    process.exitCode = 1;
  }
});
