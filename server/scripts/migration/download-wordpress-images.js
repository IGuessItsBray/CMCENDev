const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const { parseArgs, resolvePath } = require('./lib/args');
const { ensureDirectory, writeJson } = require('./lib/wordpress');

const args = parseArgs();
const outputDir = resolvePath(args.output, path.join(__dirname, 'output'));
const manifestPath = resolvePath(
  args.manifest,
  path.join(outputDir, 'wordpress-image-download-manifest.json')
);
const imageDir = resolvePath(args.images, path.join(outputDir, 'images'));
const limit = args.limit ? Number(args.limit) : Infinity;

function safeFileName(value) {
  return String(value || 'image')
    .replace(/[^a-z0-9._-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 160);
}

function getFileName(entry) {
  const fromPath = entry.attachedFile || new URL(entry.sourceUrl).pathname;
  const baseName = path.basename(fromPath) || `${entry.wordpressAttachmentId}`;

  return `${entry.wordpressAttachmentId}-${safeFileName(baseName)}`;
}

function download(url, destination) {
  const client = url.startsWith('https:') ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.get(url, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        download(response.headers.location, destination)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    });

    request.on('error', reject);
  });
}

async function main() {
  const entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const results = [];

  ensureDirectory(imageDir);

  for (const entry of entries.slice(0, limit)) {
    const fileName = getFileName(entry);
    const localPath = path.join(imageDir, fileName);

    if (fs.existsSync(localPath) && !args.force) {
      results.push({
        ...entry,
        localPath,
        downloaded: true,
        skipped: true
      });
      continue;
    }

    try {
      await download(entry.sourceUrl, localPath);
      results.push({
        ...entry,
        localPath,
        downloaded: true
      });
      console.log(`Downloaded ${entry.sourceUrl}`);
    } catch (error) {
      results.push({
        ...entry,
        localPath,
        downloaded: false,
        error: error.message
      });
      console.error(`Failed ${entry.sourceUrl}: ${error.message}`);
    }
  }

  writeJson(path.join(outputDir, 'wordpress-image-local-manifest.json'), results);

  console.log(`Wrote ${results.length} image download results.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
