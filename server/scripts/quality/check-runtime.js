const currentMajor = Number.parseInt(process.versions.node.split('.')[0], 10);

if (!Number.isInteger(currentMajor) || currentMajor !== 24) {
  console.error(
    `CMCEN requires Node.js >=24 and <25. Current version: ${process.version}. ` +
      'Run `nvm use` from the repository root before installing dependencies or running commands.',
  );
  process.exitCode = 1;
}
