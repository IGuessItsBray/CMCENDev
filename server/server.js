const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '.env')
});
const nodeCrypto = require('crypto');
const childProcess = require('child_process');

if (!globalThis.crypto) {
  globalThis.crypto = nodeCrypto.webcrypto;
}

const express = require('express');
const mongoose = require('mongoose');
const adminRoutes = require('./routes/admin');
const analyticsRoutes = require('./routes/analytics');
const auditLogRoutes = require('./routes/audit-logs');
const authRoutes = require('./routes/auth');
const contentOptionRoutes = require('./routes/content-options');
const diagnosticsRoutes = require('./routes/diagnostics');
const eventRoutes = require('./routes/events');
const retirementMessageRoutes = require('./routes/retirement-messages');
const searchRoutes = require('./routes/search');
const siteConfigRoutes = require('./routes/site-config');
const translationRoutes = require('./routes/translations');
const timerRoutes = require('./routes/timers');
const uploadRoutes = require('./routes/uploads');
const mfaRoutes = require('./routes/mfa');
const pageRoutes = require('./routes/pages');

const app = express();
const isApiDocsEnabled = process.env.ENABLE_API_DOCS === 'true';
app.set('trust proxy', true);
app.use(express.json());
app.use(translationRoutes);
app.use(contentOptionRoutes);

function getBuildCommit() {
  const envCommit =
    process.env.COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA;

  if (envCommit) {
    return String(envCommit).trim();
  }

  try {
    return childProcess
      .execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      })
      .trim();
  } catch (error) {
    return '';
  }
}

const buildCommit = getBuildCommit();

app.get('/api/version', (req, res) => {
  res.json({
    commit: buildCommit,
    shortCommit: buildCommit ? buildCommit.slice(0, 7) : ''
  });
});

if (isApiDocsEnabled) {
  app.get('/api-docs/openapi.yaml', (req, res) => {
    res.type('yaml');
    res.sendFile(path.join(__dirname, '..', 'api', 'schema', 'openapi.yaml'));
  });

  app.get('/api-docs', (req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CMCEN API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body {
        margin: 0;
        background: #f7f7f7;
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/api-docs/openapi.yaml",
        dom_id: "#swagger-ui",
        deepLinking: true,
        displayRequestDuration: true
      });
    </script>
  </body>
</html>`);
  });
}

function redirectHtmlExtension(req, res, next) {
  if (!['GET', 'HEAD'].includes(req.method) || !req.path.endsWith('.html')) {
    return next();
  }

  const nextPath = req.path === '/index.html'
    ? '/'
    : req.path.replace(/\.html$/u, '');

  return res.redirect(301, `${nextPath}${req.url.slice(req.path.length)}`);
}

function serveExtensionlessHtml(req, res, next) {
  if (
    !['GET', 'HEAD'].includes(req.method) ||
    req.path === '/' ||
    req.path.includes('.') ||
    req.path.startsWith('/api/')
  ) {
    return next();
  }

  return res.sendFile(path.join(__dirname, 'public', `${req.path.slice(1)}.html`), error => {
    if (error) {
      return next();
    }
  });
}

app.use(redirectHtmlExtension);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/analytics', analyticsRoutes);
app.use('/api', authRoutes);
app.use('/api/mfa', mfaRoutes);
app.use('/api', diagnosticsRoutes);
app.use('/api', timerRoutes);
app.use('/api', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/site-config', siteConfigRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/retirement-messages', retirementMessageRoutes);
app.use('/api/search', searchRoutes);
app.use(pageRoutes);
app.use(serveExtensionlessHtml);

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
