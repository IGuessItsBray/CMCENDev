const fs = require('node:fs');
const sharp = require('sharp');
const { parseArgs } = require('./lib/args');
const { hash } = require('./lib/content-preflight');

async function verifyUrl(value) {
  const url = new URL(value);
  if (
    !['cmcen-rcmce.ca', 'media.cefamily.ca'].includes(url.hostname) ||
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error('Unsupported media host');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 50 * 1024 * 1024)
      throw new Error('Media exceeds 50 MiB verification limit');
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const type = response.headers.get('content-type')?.split(';')[0];
  if (!buffer.length) throw new Error('Empty media');
  if (type?.startsWith('image/')) await sharp(buffer).metadata();
  else if (type === 'application/pdf') {
    if (buffer.subarray(0, 5).toString() !== '%PDF-')
      throw new Error('Invalid PDF signature');
  } else throw new Error('Unsupported media content type');
  return { sha256: hash(buffer), bytes, type };
}

async function main() {
  const args = parseArgs();
  if (
    !args.input ||
    !args.output ||
    args._.length ||
    Object.keys(args).some((k) => !['_', 'input', 'output'].includes(k))
  )
    throw new Error('Use --input and --output');
  const rows = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  const results = [];
  for (const row of rows) {
    const result = {
      sourceUrl: row.sourceUrl,
      destinationUrl: row.destinationUrl || null,
      sourceVerified: false,
      destinationVerified: false,
      checkedAt: new Date().toISOString(),
    };
    try {
      const source = await verifyUrl(row.sourceUrl);
      Object.assign(result, {
        sourceVerified: true,
        sourceSha256: source.sha256,
        bytes: source.bytes,
        contentType: source.type,
      });
      if (row.destinationUrl) {
        const destination = await verifyUrl(row.destinationUrl);
        result.destinationSha256 = destination.sha256;
        result.destinationVerified = destination.sha256 === source.sha256;
        if (!result.destinationVerified)
          result.error = 'Destination checksum mismatch';
      }
    } catch (error) {
      result.error = error.message;
    }
    results.push(result);
  }
  fs.writeFileSync(args.output, JSON.stringify(results, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      checked: results.length,
      sourceVerified: results.filter((r) => r.sourceVerified).length,
      destinationVerified: results.filter((r) => r.destinationVerified).length,
    }),
  );
}
if (require.main === module)
  main().catch(() => {
    console.error('Media verification failed');
    process.exitCode = 1;
  });
module.exports = { verifyUrl };
