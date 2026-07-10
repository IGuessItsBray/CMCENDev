const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '.env')
});
const nodeCrypto = require('crypto');

if (!globalThis.crypto) {
  globalThis.crypto = nodeCrypto.webcrypto;
}

const express = require('express');
const mongoose = require('mongoose');
const adminRoutes = require('./routes/admin');
const auditLogRoutes = require('./routes/audit-logs');
const authRoutes = require('./routes/auth');
const contentOptionRoutes = require('./routes/content-options');
const diagnosticsRoutes = require('./routes/diagnostics');
const eventRoutes = require('./routes/events');
const retirementMessageRoutes = require('./routes/retirement-messages');
const searchRoutes = require('./routes/search');
const siteConfigRoutes = require('./routes/site-config');
const translationRoutes = require('./routes/translations');
const uploadRoutes = require('./routes/uploads');
const mfaRoutes = require('./routes/mfa');
const pageRoutes = require('./routes/pages');

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(translationRoutes);
app.use(contentOptionRoutes);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', authRoutes);
app.use('/api/mfa', mfaRoutes);
app.use('/api', diagnosticsRoutes);
app.use('/api', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/site-config', siteConfigRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/retirement-messages', retirementMessageRoutes);
app.use('/api/search', searchRoutes);
app.use(pageRoutes);

const publicDirectory = path.join(__dirname, 'public');

function wantsHtmlResponse(req) {
  return !req.path.startsWith('/api/') && Boolean(req.accepts('html'));
}

function sendErrorPage(res, statusCode) {
  const page = [401, 403, 404].includes(statusCode)
    ? `${statusCode}.html`
    : '500.html';

  res.status(statusCode).sendFile(path.join(publicDirectory, page));
}

app.use((req, res) => {
  if (wantsHtmlResponse(req)) {
    return sendErrorPage(res, 404);
  }

  return res.status(404).json({ error: 'Endpoint not found' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status
    : 500;

  console.error('Unhandled request error:', error);

  if (wantsHtmlResponse(req)) {
    return sendErrorPage(res, statusCode);
  }

  return res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error' : 'Request failed'
  });
});

// wait for MongoDB before listening
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    app.listen(process.env.PORT || 3000, () => {
      console.log(
        `Server running on port ${process.env.PORT || 3000}`
      );
    });
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
}

startServer();
