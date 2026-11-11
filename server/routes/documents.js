const express = require('express');
const multer = require('multer');
const { randomUUID } = require('node:crypto');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const UploadedDocument = require('../models/UploadedDocument');
const {
  validatePdf,
  MAX_DOCUMENT_BYTES,
} = require('../services/document-upload');
const { buildPublicMediaUrl } = require('../services/media-library');
const { writeAuditLog } = require('../services/audit-log');
const s3 = require('../storage');
const router = express.Router();
let activeUploads = 0;

router.use(
  authMiddleware,
  requirePermission('canUploadMedia'),
  (req, res, next) => {
    if (
      !['canManageNews', 'canManagePages', 'canReviewAndPublish'].some(
        (key) => req.permissions[key],
      )
    )
      return res
        .status(403)
        .json({ error: 'Editorial permissions are required.' });
    res.set('Cache-Control', 'no-store');
    next();
  },
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DOCUMENT_BYTES,
    files: 1,
    fields: 1,
    parts: 2,
    fieldSize: 20,
    fieldNameSize: 40,
    headerPairs: 50,
  },
  fileFilter(req, file, done) {
    if (
      file.mimetype !== 'application/pdf' ||
      !/\.pdf$/iu.test(file.originalname)
    )
      return done(
        Object.assign(new Error('Only PDF files are supported.'), {
          status: 422,
        }),
      );
    done(null, true);
  },
}).single('document');

function serialize(record) {
  return {
    id: String(record._id),
    name: record.name,
    url: buildPublicMediaUrl(record.key),
    size: record.size,
    pages: record.pages,
    createdAt: record.createdAt,
  };
}

router.get('/', async (req, res) => {
  try {
    const cursor = req.query.cursor;
    if (
      cursor !== undefined &&
      (typeof cursor !== 'string' || !/^[a-f0-9]{24}$/u.test(cursor))
    )
      return res.status(400).json({ error: 'Invalid cursor.' });
    const records = await UploadedDocument.find(
      cursor ? { _id: { $lt: cursor } } : {},
    )
      .sort({ _id: -1 })
      .limit(51)
      .lean();
    const hasMore = records.length > 50;
    const page = records.slice(0, 50);
    res.json({
      documents: page.map(serialize),
      nextCursor: hasMore ? String(page.at(-1)._id) : '',
    });
  } catch (error) {
    console.error('Document listing failed:', error);
    res.status(500).json({ error: 'Could not load uploaded documents.' });
  }
});

router.post(
  '/',
  (req, res, next) => {
    if (activeUploads >= 2)
      return res
        .set('Retry-After', '5')
        .status(429)
        .json({ error: 'Uploads are busy. Please try again later.' });
    activeUploads++;
    let released = false;
    req.releaseDocumentUpload = () => {
      if (!released) {
        released = true;
        activeUploads--;
      }
    };
    res.once('close', () => {
      if (!req.processingDocument) req.releaseDocumentUpload();
    });
    upload(req, res, (error) => {
      if (req.aborted || res.destroyed) {
        req.releaseDocumentUpload();
        return;
      }
      if (error) {
        req.releaseDocumentUpload();
        return res
          .status(
            error instanceof multer.MulterError ? 413 : error.status || 400,
          )
          .json({
            error:
              error instanceof multer.MulterError
                ? 'Upload exceeds multipart limits.'
                : error.message,
          });
      }
      next();
    });
  },
  async (req, res) => {
    req.processingDocument = true;
    let key;
    let stored = false;
    let record;
    try {
      if (!req.file)
        return res.status(400).json({ error: 'Choose a PDF to upload.' });
      if (req.body.publicConfirmed !== 'true')
        return res.status(400).json({
          error: 'Confirm that this document is approved for public access.',
        });
      const urlBase = buildPublicMediaUrl('documents/uploads/check.pdf');
      if (!/^https:\/\//u.test(urlBase))
        return res
          .status(503)
          .json({ error: 'Public document storage is not configured.' });
      const processed = await validatePdf(req.file.buffer);
      if (req.aborted || res.destroyed) return;
      key = `documents/uploads/${randomUUID()}.pdf`;
      const name =
        req.file.originalname
          .split(/[\\/]/u)
          .at(-1)
          .replace(/[\u0000-\u001f\u007f]/gu, '')
          .slice(0, 160) || 'document.pdf';
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.MINIO_BUCKET_NAME,
          Key: key,
          Body: processed.buffer,
          ContentType: 'application/pdf',
          ContentDisposition: `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        }),
      );
      stored = true;
      record = await UploadedDocument.create({
        key,
        name,
        size: processed.buffer.length,
        pages: processed.pages,
        uploadedBy: req.user._id,
        publicConfirmedAt: new Date(),
      });
      await writeAuditLog({
        req,
        action: 'media.document_uploaded',
        actor: req.user,
        targetType: 'document',
        target: record._id,
        targetSnapshot: { title: name, key },
        metadata: {
          size: record.size,
          pages: record.pages,
          publicConfirmed: true,
        },
      });
      res.status(201).json(serialize(record));
    } catch (error) {
      if (stored && !record) {
        try {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: process.env.MINIO_BUCKET_NAME,
              Key: key,
            }),
          );
        } catch (cleanupError) {
          console.error('Document upload cleanup failed:', key, cleanupError);
        }
      }
      if (!error.status || error.status >= 500)
        console.error('Document upload failed:', error);
      res.status(error.status || 500).json({
        error: error.status ? error.message : 'Could not upload this document.',
      });
    } finally {
      req.releaseDocumentUpload();
    }
  },
);

module.exports = router;
