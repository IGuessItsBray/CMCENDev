const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const STATIC_ASSET_EXTENSIONS = new Set(['.css', '.js']);
const VERSIONED_ASSET_FILENAME = /^(.*)\.([a-f0-9]{12})(\.(?:css|js))$/u;
const HTML_ASSET_REFERENCE =
  /(?<prefix>\b(?:href|src)\s*=\s*["'])(?<url>[^"']+)(?<quote>["'])/giu;

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(entryPath);
    }

    return entry.isFile() ? [entryPath] : [];
  });
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function isVersionedAssetPath(filePath) {
  return VERSIONED_ASSET_FILENAME.test(path.basename(filePath));
}

function getVersionedAssetFilename(filePath, contents) {
  const extension = path.extname(filePath);
  const basename = path.basename(filePath, extension);
  const contentHash = crypto
    .createHash('sha256')
    .update(contents)
    .digest('hex')
    .slice(0, 12);

  return `${basename}.${contentHash}${extension}`;
}

function getPublicAssetFiles(publicDirectory) {
  return collectFiles(publicDirectory).filter((filePath) => {
    const extension = path.extname(filePath);

    return (
      STATIC_ASSET_EXTENSIONS.has(extension) && !isVersionedAssetPath(filePath)
    );
  });
}

function removeVersionedAssets(publicDirectory) {
  collectFiles(publicDirectory)
    .filter(isVersionedAssetPath)
    .forEach((filePath) => fs.unlinkSync(filePath));
}

function splitReferenceUrl(value) {
  if (
    !value ||
    value.startsWith('#') ||
    value.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/iu.test(value)
  ) {
    return null;
  }

  const match = /^([^?#]*)([?#][\s\S]*)?$/u.exec(value);

  if (!match) {
    return null;
  }

  const [, pathname, suffix = ''] = match;

  return pathname ? { pathname, suffix } : null;
}

function normalizePublicPath(pathname, htmlDirectory) {
  let decodedPathname;

  try {
    decodedPathname = decodeURIComponent(pathname).replace(/\\/gu, '/');
  } catch {
    return null;
  }

  const publicPath = decodedPathname.startsWith('/')
    ? decodedPathname.slice(1)
    : path.posix.join(htmlDirectory, decodedPathname);
  const normalizedPath = path.posix.normalize(publicPath);

  if (
    !normalizedPath ||
    normalizedPath === '.' ||
    normalizedPath.startsWith('../') ||
    path.posix.isAbsolute(normalizedPath)
  ) {
    return null;
  }

  return normalizedPath;
}

function getOriginalAssetPath(publicPath, assetMap) {
  if (assetMap.has(publicPath)) {
    return publicPath;
  }

  const match = VERSIONED_ASSET_FILENAME.exec(path.posix.basename(publicPath));

  if (!match) {
    return publicPath;
  }

  const originalPath = path.posix.join(
    path.posix.dirname(publicPath),
    `${match[1]}${match[3]}`,
  );

  return assetMap.has(originalPath) ? originalPath : publicPath;
}

function getReferencePath(versionedPath, isAbsolute, htmlDirectory) {
  if (isAbsolute) {
    return `/${versionedPath}`;
  }

  const relativePath = path.posix.relative(htmlDirectory, versionedPath);

  return relativePath || path.posix.basename(versionedPath);
}

function rewriteHtmlReferences(html, htmlPath, publicDirectory, assetMap) {
  const htmlDirectory = path.posix.dirname(
    toPosixPath(path.relative(publicDirectory, htmlPath)),
  );
  const normalizedHtmlDirectory = htmlDirectory === '.' ? '' : htmlDirectory;

  return html.replace(
    HTML_ASSET_REFERENCE,
    (reference, prefix, value, quote) => {
      const splitUrl = splitReferenceUrl(value);

      if (!splitUrl) {
        return reference;
      }

      const publicPath = normalizePublicPath(
        splitUrl.pathname,
        normalizedHtmlDirectory,
      );

      if (!publicPath) {
        return reference;
      }

      const originalAssetPath = getOriginalAssetPath(publicPath, assetMap);
      const versionedPath = assetMap.get(originalAssetPath);

      if (!versionedPath) {
        return reference;
      }

      const replacementPath = getReferencePath(
        versionedPath,
        splitUrl.pathname.startsWith('/'),
        normalizedHtmlDirectory,
      );

      return `${prefix}${replacementPath}${splitUrl.suffix}${quote}`;
    },
  );
}

function buildStaticAssets({ publicDirectory, rewriteHtml = false }) {
  removeVersionedAssets(publicDirectory);

  const assetMap = new Map();

  getPublicAssetFiles(publicDirectory).forEach((filePath) => {
    const contents = fs.readFileSync(filePath);
    const relativePath = toPosixPath(path.relative(publicDirectory, filePath));
    const versionedRelativePath = path.posix.join(
      path.posix.dirname(relativePath),
      getVersionedAssetFilename(filePath, contents),
    );
    const versionedFilePath = path.join(publicDirectory, versionedRelativePath);

    fs.writeFileSync(versionedFilePath, contents);
    assetMap.set(relativePath, versionedRelativePath);
  });

  const htmlFiles = collectFiles(publicDirectory).filter((filePath) =>
    filePath.endsWith('.html'),
  );

  if (rewriteHtml) {
    htmlFiles.forEach((filePath) => {
      const html = fs.readFileSync(filePath, 'utf8');
      const rewrittenHtml = rewriteHtmlReferences(
        html,
        filePath,
        publicDirectory,
        assetMap,
      );

      fs.writeFileSync(filePath, rewrittenHtml);
    });
  }

  return {
    assetMap,
    htmlFileCount: htmlFiles.length,
  };
}

function run() {
  const argumentsList = process.argv.slice(2);

  if (argumentsList.length !== 1 || argumentsList[0] !== '--rewrite-html') {
    throw new Error(
      'Usage: node scripts/quality/build-static-assets.js --rewrite-html',
    );
  }

  const { assetMap, htmlFileCount } = buildStaticAssets({
    publicDirectory: path.resolve(__dirname, '..', '..', 'public'),
    rewriteHtml: true,
  });

  console.log(
    `Fingerprinted ${assetMap.size} static assets across ${htmlFileCount} HTML files`,
  );
}

if (require.main === module) {
  run();
}

module.exports = {
  buildStaticAssets,
  getVersionedAssetFilename,
  isVersionedAssetPath,
  rewriteHtmlReferences,
};
