const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
  try {
    const source = fs.readFileSync(filePath, 'utf8').replace(/^#!.*\r?\n/u, '');
    new vm.Script(source, { filename: filePath });
  } catch (error) {
    console.error(error);
    hasFailure = true;
  }
}

if (hasFailure) {
  process.exitCode = 1;
}
