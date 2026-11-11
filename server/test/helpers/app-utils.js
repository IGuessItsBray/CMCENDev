const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = function loadAppUtils(globals = {}) {
  const window = {
    location: { origin: 'https://cmcen.example' },
    addEventListener() {},
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../../public/app-utils.js'), 'utf8'),
    {
      window,
      document: {
        addEventListener() {},
        documentElement: {},
        querySelectorAll: () => [],
      },
      URL,
      URLSearchParams,
      HTMLImageElement: class {},
      MutationObserver: class {
        observe() {}
      },
      fetch: async () => ({ ok: false }),
      ...globals,
    },
  );
  return window.CMCENUtils;
};
