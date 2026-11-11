const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require('node:worker_threads');
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

function invalid(
  message = 'Upload a valid PDF without encryption, forms, scripts, or embedded files.',
) {
  return Object.assign(new Error(message), { status: 422 });
}

function validatePdf(buffer) {
  if (
    !Buffer.isBuffer(buffer) ||
    !buffer.length ||
    buffer.length > MAX_DOCUMENT_BYTES
  )
    return Promise.reject(
      invalid('PDF files must be between 1 byte and 20 MiB.'),
    );
  if (
    !buffer
      .subarray(0, 8)
      .toString('ascii')
      .match(/^%PDF-(?:1\.[0-7]|2\.0)/u)
  )
    return Promise.reject(invalid());
  // Bound the memory and CPU consumed by untrusted compressed PDF objects.
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: buffer,
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 16,
      },
    });
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(
        invalid(
          'This PDF is too complex to process. Export a simpler PDF and try again.',
        ),
      );
    }, 15000);
    worker.once('message', (result) => {
      clearTimeout(timeout);
      if (result.error) reject(invalid());
      else resolve({ buffer: Buffer.from(result.buffer), pages: result.pages });
    });
    worker.once('error', () => {
      clearTimeout(timeout);
      reject(invalid());
    });
    worker.once('exit', () => {
      clearTimeout(timeout);
      // A normal result already settled the promise. An exit without a message
      // must reject too, rather than leaving an upload slot reserved forever.
      reject(invalid());
    });
  });
}

async function inspectPdf(bytes) {
  const {
    PDFDocument,
    PDFDict,
    PDFArray,
    PDFName,
    PDFString,
    PDFHexString,
    PDFStream,
  } = require('pdf-lib');
  const pdf = await PDFDocument.load(bytes, {
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 500)
    throw invalid();
  const forbidden = new Set([
    'JS',
    'JavaScript',
    'AA',
    'OpenAction',
    'AcroForm',
    'XFA',
    'EmbeddedFiles',
    'EmbeddedFile',
    'Filespec',
    'EF',
    'RichMedia',
    'RichMediaContent',
    'RichMediaSettings',
    'Collection',
    'Launch',
    'SubmitForm',
    'ImportData',
    'GoToR',
    'GoToE',
    'Rendition',
    'Movie',
    'Sound',
    '3DD',
    '3DA',
    'PS',
  ]);
  const seen = new Set();
  function visit(value, action = false) {
    value = pdf.context.lookup(value);
    if (!value) return;
    // Action references can be encountered earlier in the indirect-object list.
    // Validate their action role even when their dictionary was already visited.
    if (action && value instanceof PDFDict) {
      const kind = value.lookup(PDFName.of('S'))?.decodeText?.();
      if (!['URI', 'GoTo'].includes(kind) || value.has(PDFName.of('Next')))
        throw invalid();
    }
    if (seen.has(value)) return;
    seen.add(value);
    if (seen.size > 100000) throw invalid();
    if (value instanceof PDFStream) {
      if (value.dict.has(PDFName.of('F'))) throw invalid();
      return visit(value.dict);
    }
    if (value instanceof PDFArray) {
      for (let i = 0; i < value.size(); i++) visit(value.get(i), action);
      return;
    }
    if (!(value instanceof PDFDict)) return;
    const name = (key) => value.lookup(PDFName.of(key))?.decodeText?.();
    if (
      forbidden.has(name('Type')) ||
      forbidden.has(name('Subtype')) ||
      forbidden.has(name('S'))
    )
      throw invalid();
    if (action || name('Type') === 'Action') {
      if (!['URI', 'GoTo'].includes(name('S')) || value.has(PDFName.of('Next')))
        throw invalid();
    }
    for (const [key, entry] of value.entries()) {
      const field = key.decodeText();
      if (forbidden.has(field)) throw invalid();
      if (field === 'URI') {
        const uri = pdf.context.lookup(entry);
        if (!(uri instanceof PDFString || uri instanceof PDFHexString))
          throw invalid();
        let url;
        try {
          url = new URL(uri.decodeText());
        } catch {
          throw invalid();
        }
        if (!['http:', 'https:', 'mailto:'].includes(url.protocol))
          throw invalid();
      }
      visit(entry, field === 'A');
    }
  }
  // Inspect all objects, including unreachable objects and compressed object streams.
  for (const [, object] of pdf.context.enumerateIndirectObjects())
    visit(object);
  visit(pdf.catalog);
  // Drop authoring metadata without changing page geometry or accessible structure.
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    const dictionary = object instanceof PDFStream ? object.dict : object;
    if (dictionary instanceof PDFDict) {
      const metadata = dictionary.get(PDFName.of('Metadata'));
      dictionary.delete(PDFName.of('Metadata'));
      if (metadata) pdf.context.delete(metadata);
    }
  }
  if (pdf.context.trailerInfo.Info)
    pdf.context.delete(pdf.context.trailerInfo.Info);
  pdf.context.trailerInfo.Info = undefined;
  const output = await pdf.save({ addDefaultPage: false });
  if (output.length > MAX_DOCUMENT_BYTES) throw invalid();
  return { buffer: output, pages: pdf.getPageCount() };
}

if (!isMainThread) {
  inspectPdf(workerData)
    .then((result) => parentPort.postMessage(result))
    .catch(() => parentPort.postMessage({ error: true }));
}

module.exports = { validatePdf, MAX_DOCUMENT_BYTES };
