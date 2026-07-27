const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const serverRoot = path.resolve(__dirname, '..', '..');
const ignoredDirectories = new Set(['node_modules', 'output']);

function collectJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name)
        ? []
        : collectJavaScriptFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  });
}

const files = collectJavaScriptFiles(serverRoot);
let hasFailure = false;

for (const filePath of files) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    hasFailure = true;
  }
}

if (hasFailure) {
  process.exitCode = 1;
}
