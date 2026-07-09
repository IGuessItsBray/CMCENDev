const express = require('express');
const multer = require('multer');
const {
  GetObjectCommand,
  PutObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { randomUUID } = require('crypto');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { buildPublicMediaUrl } = require('../services/media-library');
const s3Client = require('../storage');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/upload
// Upload an authenticated user's image to object storage.
router.post(
  '/upload',
  authMiddleware,
  requirePermission('canUploadMedia'),
  upload.single('image'),
  async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileExtension = req.file.originalname.split('.').pop();
    const fileKey = `${randomUUID()}.${fileExtension}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.MINIO_BUCKET_NAME,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));

    res.status(201).json({
      message: 'Upload successful',
      key: fileKey,
      url: buildPublicMediaUrl(fileKey)
    });
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ error: 'Could not upload file' });
  }
  }
);

// GET /api/image/:key
// Generate a short-lived signed URL for an object-storage image.
router.get('/image/:key', authMiddleware, requirePermission('canViewMediaLibrary'), async (req, res) => {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.MINIO_BUCKET_NAME,
      Key: req.params.key
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 900
    });

    res.json({ url: signedUrl });
  } catch (err) {
    res.status(500).json({ error: 'Could not generate secure link' });
  }
});

module.exports = router;
