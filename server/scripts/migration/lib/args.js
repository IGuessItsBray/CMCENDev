const path = require('path');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    _: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith('--')) {
      args._.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const equalsIndex = withoutPrefix.indexOf('=');

    if (equalsIndex !== -1) {
      args[withoutPrefix.slice(0, equalsIndex)] = withoutPrefix.slice(
        equalsIndex + 1,
      );
      continue;
    }

    const next = argv[index + 1];

    if (next && !next.startsWith('--')) {
      args[withoutPrefix] = next;
      index += 1;
    } else {
      args[withoutPrefix] = true;
    }
  }

  return args;
}

function resolvePath(value, fallback) {
  return path.resolve(value || fallback);
}

module.exports = {
  parseArgs,
  resolvePath,
};
