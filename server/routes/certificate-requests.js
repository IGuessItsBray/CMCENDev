const express = require('express');
const {
  certificateFilename,
  certificateDisposition,
  certificateTimeZone,
} = require('../services/certificate-filenames');
const { FAMILY_WORDING_OPTIONS } = require('../config/certificate-wording');
const {
  generateTrustedToServe,
  getTrustedToServeData,
} = require('../services/trusted-to-serve-documents');
const {
  CertificateDocumentError,
  generateMemberCertificate,
  generateFamilyCertificate,
  generateCertificatePacket,
  getFamilyCertificateData,
  validatePacketOptions,
} = require('../services/certificate-documents');
const CertificateRequest = require('../models/CertificateRequest');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit-log');
const { cleanString } = require('../services/content-utils');
const {
  CERTIFICATE_REQUEST_ACTIONABLE_STATUSES,
  CERTIFICATE_REQUEST_STATUSES,
} = require('../config/certificate-requests');
const {
  getCertificateRequestSnapshot,
} = require('../services/content-snapshots');

const router = express.Router();
function validateCertificateTimeZone(req, res, next) {
  try {
    if (Object.keys(req.query).some((key) => key.startsWith('timeZone[')))
      throw new RangeError('Invalid certificate time zone');
    res.locals.certificateTimeZone = certificateTimeZone(req.query.timeZone);
    next();
  } catch {
    return res.status(400).json({
      code: 'certificate_time_zone_invalid',
      error: 'Invalid certificate time zone',
    });
  }
}
const {
  getTrustedToServeRequest,
  getRetirementRequest,
  getRequester,
} = require('../services/trusted-to-serve-requests');

router.get(
  '/options',
  authMiddleware,
  requirePermission('canSubmitCertificateRequests'),
  (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    return res.json({
      relationships: require('../config/certificate-requests')
        .CERTIFICATE_FAMILY_RELATIONSHIPS,
      wordings: FAMILY_WORDING_OPTIONS,
    });
  },
);

router.post(
  ['/trusted-to-serve', '/retirement'],
  (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  },
  authMiddleware,
  requirePermission('canSubmitCertificateRequests'),
  async (req, res) => {
    try {
      const isRetirement = req.path === '/retirement';
      const certificateType = isRetirement ? 'retirement' : 'trusted_to_serve';
      const input = isRetirement
        ? getRetirementRequest(req.body)
        : getTrustedToServeRequest(req.body);
      const filter = {
        createdBy: req.user._id,
        submissionKey: input.submissionKey,
      };
      const replay = (existing) => {
        if (existing.submissionFingerprint !== input.fingerprint)
          return res.status(409).json({
            error:
              'This request ID has already been used for different details.',
            code: 'certificate_request_idempotency_conflict',
          });
        return res
          .status(200)
          .json({
            certificateRequest: { id: existing._id, status: existing.status },
          });
      };
      const existing = await CertificateRequest.findOne(filter).select(
        '+submissionFingerprint',
      );
      if (existing) return replay(existing);
      const requester = getRequester(req.user, input.relationship);
      const certificateRequest = new CertificateRequest({
        certificateType,
        trustedToServe: input.trustedToServe,
        familyMembers: input.familyMembers || [],
        member: input.member,
        mailingAddress: input.mailingAddress,
        requester,
        createdBy: req.user._id,
        updatedBy: req.user._id,
        status: 'pending',
        submissionKey: input.submissionKey,
        submissionFingerprint: input.fingerprint,
      });
      certificateRequest.source = {
        type: isRetirement ? 'retirementCertificate' : 'trustedToServe',
        id: certificateRequest._id,
      };
      try {
        await certificateRequest.save();
      } catch (error) {
        if (error.code !== 11000) throw error;
        const duplicate = await CertificateRequest.findOne(filter).select(
          '+submissionFingerprint',
        );
        if (!duplicate) throw error;
        return replay(duplicate);
      }
      await writeAuditLog({
        req,
        actor: req.user,
        action: 'content.certificate_request_submitted',
        targetType: 'certificateRequest',
        target: certificateRequest._id,
        targetSnapshot: getCertificateRequestSnapshot(certificateRequest),
        metadata: {
          certificateType,
          ...(!isRetirement
            ? { awardRole: input.trustedToServe.awardRole }
            : {}),
        },
      });
      return res
        .status(201)
        .json({
          certificateRequest: {
            id: certificateRequest._id,
            status: certificateRequest.status,
          },
        });
    } catch (error) {
      if (error instanceof CertificateDocumentError)
        return res
          .status(error.status)
          .json({
            error: error.message,
            code: error.code,
            ...(error.missingFields
              ? { missingFields: error.missingFields }
              : {}),
          });
      if (error.name === 'ValidationError')
        return res
          .status(422)
          .json({
            error: 'The certificate request details are invalid.',
            code: 'certificate_request_invalid',
          });
      console.error('Could not submit certificate request');
      return res
        .status(500)
        .json({ error: 'Could not submit certificate request' });
    }
  },
);

router.post(
  '/:certificateRequestId/trusted-to-serve.pdf',
  (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  },
  authMiddleware,
  requirePermission('canManageCertificateRequests'),
  validateCertificateTimeZone,
  async (req, res) => {
    if (!/^[a-f0-9]{24}$/iu.test(req.params.certificateRequestId))
      return res.status(404).json({ error: 'Certificate request not found' });
    if (req.query.download !== undefined && req.query.download !== '1')
      return res
        .status(400)
        .json({ error: 'Invalid certificate download option' });
    if (
      !req.body ||
      req.body.reviewed !== true ||
      Object.keys(req.body).some((key) => key !== 'reviewed')
    )
      return res
        .status(422)
        .json({
          error:
            'Review the saved award details before generating the certificate.',
          code: 'award_review_required',
        });
    try {
      const certificateRequest = await CertificateRequest.findById(
        req.params.certificateRequestId,
      ).lean();
      if (!certificateRequest)
        return res.status(404).json({ error: 'Certificate request not found' });
      if (certificateRequest.certificateType !== 'trusted_to_serve')
        return res
          .status(422)
          .json({
            error: 'This is not a Trusted to Serve request.',
            code: 'award_data_invalid',
          });
      const bytes = await generateTrustedToServe(
        certificateRequest.trustedToServe,
      );
      await writeAuditLog({
        req,
        actor: req.user,
        action: 'content.certificate_request_trusted_to_serve_generated',
        targetType: 'certificateRequest',
        target: certificateRequest._id,
        targetSnapshot: getCertificateRequestSnapshot(certificateRequest),
        metadata: {
          certificateKey: 'member',
          awardRole: certificateRequest.trustedToServe.awardRole ?? 'student',
          reviewed: true,
          disposition: req.query.download === '1' ? 'attachment' : 'inline',
        },
      });
      res.set(
        'Content-Disposition',
        certificateDisposition(
          certificateFilename(certificateRequest, {
            timeZone: res.locals.certificateTimeZone,
          }),
          req.query.download === '1',
        ),
      );
      return res.type('pdf').send(bytes);
    } catch (error) {
      if (error instanceof CertificateDocumentError)
        return res
          .status(error.status)
          .json({ error: error.message, code: error.code });
      console.error(
        'Could not generate requested Trusted to Serve certificate',
      );
      return res
        .status(500)
        .json({ error: 'Could not generate Trusted to Serve certificate' });
    }
  },
);
const {
  getManualRetirementRequest,
} = require('../services/manual-retirement-certificate');

router.post(
  '/retirement.pdf',
  (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  },
  authMiddleware,
  requirePermission('canManageCertificateRequests'),
  validateCertificateTimeZone,
  async (req, res) => {
    if (req.query.download !== undefined && req.query.download !== '1')
      return res
        .status(400)
        .json({ error: 'Invalid certificate download option' });
    try {
      const request = getManualRetirementRequest(req.body);
      if (req.query.download === '1' && req.body.reviewed !== true)
        throw new CertificateDocumentError(
          'certificate_review_required',
          'Review the entered member and family details and service dates before downloading.',
        );
      const kind = req.body.documentKind ?? 'member';
      const bytes =
        kind === 'family'
          ? await generateFamilyCertificate(request, req.body.familyIndex)
          : kind === 'packet'
            ? await generateCertificatePacket(request)
            : await generateMemberCertificate(request);
      await writeAuditLog({
        req,
        actor: req.user,
        action: 'content.manual_retirement_generated',
        targetType: 'certificateDocument',
        targetSnapshot: {
          certificateType: 'retirement',
          title: 'Member retirement certificate',
        },
        metadata: {
          ceBranchEnrollmentDate: request.member.ceBranchEnrollmentDate,
          releaseDate: request.member.releaseDate,
          reviewed: req.body.reviewed === true,
          documentKind: kind,
          familyCount: request.familyMembers.length,
          disposition: req.query.download === '1' ? 'attachment' : 'inline',
        },
      });
      res.set(
        'Content-Disposition',
        certificateDisposition(
          certificateFilename(request, {
            timeZone: res.locals.certificateTimeZone,
            kind,
            familyIndex: req.body.familyIndex,
          }),
          req.query.download === '1',
        ),
      );
      return res.type('pdf').send(bytes);
    } catch (error) {
      if (error instanceof CertificateDocumentError)
        return res
          .status(error.status)
          .json({ error: error.message, code: error.code });
      console.error('Could not generate manual member retirement certificate');
      return res
        .status(500)
        .json({ error: 'Could not generate member retirement certificate' });
    }
  },
);

router.post(
  '/trusted-to-serve.pdf',
  (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  },
  authMiddleware,
  requirePermission('canManageCertificateRequests'),
  validateCertificateTimeZone,
  async (req, res) => {
    if (req.query.download !== undefined && req.query.download !== '1')
      return res
        .status(400)
        .json({ error: 'Invalid certificate download option' });
    try {
      const data = getTrustedToServeData(req.body);
      if (req.query.download === '1' && req.body.reviewed !== true)
        return res.status(422).json({
          error:
            'Review the award recipient, bilingual wording and presentation date before downloading.',
          code: 'award_review_required',
        });
      const bytes = await generateTrustedToServe(req.body);
      await writeAuditLog({
        req,
        action: 'content.trusted_to_serve_generated',
        actor: req.user,
        targetType: 'certificateDocument',
        targetSnapshot: {
          certificateType: 'trusted_to_serve',
          title: 'Trusted to Serve and Fighting Spirit Award',
        },
        metadata: {
          presentationDate: data.isoDate,
          awardRole: data.awardRole,
          frPronoun: data.frPronoun,
          frRankGrammar: data.frRankGrammar,
          reviewed: req.body.reviewed === true,
          disposition: req.query.download === '1' ? 'attachment' : 'inline',
        },
      });
      res.set(
        'Content-Disposition',
        certificateDisposition(
          certificateFilename(
            { certificateType: 'trusted_to_serve', trustedToServe: data },
            { timeZone: res.locals.certificateTimeZone },
          ),
          req.query.download === '1',
        ),
      );
      return res.type('pdf').send(bytes);
    } catch (error) {
      if (error instanceof CertificateDocumentError)
        return res
          .status(error.status)
          .json({ error: error.message, code: error.code });
      console.error('Could not generate Trusted to Serve certificate');
      return res
        .status(500)
        .json({ error: 'Could not generate Trusted to Serve certificate' });
    }
  },
);

router.get(
  '/:certificateRequestId/member.pdf',
  (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  },
  authMiddleware,
  requirePermission('canManageCertificateRequests'),
  validateCertificateTimeZone,
  async (req, res) => {
    if (!/^[a-f0-9]{24}$/iu.test(req.params.certificateRequestId)) {
      return res.status(404).json({ error: 'Certificate request not found' });
    }
    if (req.query.download !== undefined && req.query.download !== '1') {
      return res
        .status(400)
        .json({ error: 'Invalid certificate download option' });
    }
    try {
      const certificateRequest = await CertificateRequest.findById(
        req.params.certificateRequestId,
      ).lean();
      if (!certificateRequest)
        return res.status(404).json({ error: 'Certificate request not found' });
      const pdf = await generateMemberCertificate(certificateRequest);
      await writeAuditLog({
        req,
        action: 'content.certificate_request_member_generated',
        actor: req.user,
        targetType: 'certificateRequest',
        target: certificateRequest._id,
        targetSnapshot: getCertificateRequestSnapshot(certificateRequest),
        metadata: {
          certificateKey: 'member',
          disposition: req.query.download === '1' ? 'attachment' : 'inline',
        },
      });
      res.set(
        'Content-Disposition',
        certificateDisposition(
          certificateFilename(certificateRequest, {
            timeZone: res.locals.certificateTimeZone,
          }),
          req.query.download === '1',
        ),
      );
      return res.type('pdf').send(pdf);
    } catch (error) {
      if (error instanceof CertificateDocumentError) {
        return res
          .status(error.status)
          .json({ error: error.message, code: error.code });
      }
      // Keep request names, private paths and font data out of server errors.
      console.error('Could not generate member retirement certificate');
      return res
        .status(500)
        .json({ error: 'Could not generate member retirement certificate' });
    }
  },
);

router.post(
  [
    '/:certificateRequestId/family/:familyIndex.pdf',
    '/:certificateRequestId/packet.pdf',
  ],
  (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  },
  authMiddleware,
  requirePermission('canManageCertificateRequests'),
  validateCertificateTimeZone,
  async (req, res) => {
    const isFamily = req.params.familyIndex !== undefined;
    const index = Number(req.params.familyIndex);
    if (
      !/^[a-f0-9]{24}$/iu.test(req.params.certificateRequestId) ||
      (isFamily &&
        (!/^(0|[1-9]\d*)$/u.test(req.params.familyIndex) ||
          !Number.isSafeInteger(index)))
    ) {
      return res
        .status(404)
        .json({ error: 'Certificate request or family recipient not found' });
    }
    if (req.query.download !== undefined && req.query.download !== '1')
      return res
        .status(400)
        .json({ error: 'Invalid certificate download option' });
    try {
      const certificateRequest = await CertificateRequest.findById(
        req.params.certificateRequestId,
      ).lean();
      if (!certificateRequest)
        return res.status(404).json({ error: 'Certificate request not found' });
      const reviewed = isFamily
        ? [getFamilyCertificateData(certificateRequest, index, req.body)]
        : validatePacketOptions(certificateRequest, req.body);
      const bytes = isFamily
        ? await generateFamilyCertificate(certificateRequest, index, req.body)
        : await generateCertificatePacket(certificateRequest, req.body);
      await writeAuditLog({
        req,
        action: isFamily
          ? 'content.certificate_request_family_generated'
          : 'content.certificate_request_packet_generated',
        actor: req.user,
        targetType: 'certificateRequest',
        target: certificateRequest._id,
        targetSnapshot: getCertificateRequestSnapshot(certificateRequest),
        metadata: {
          certificateKeys: isFamily
            ? [`family:${index}`]
            : ['member', ...reviewed.map((_, i) => `family:${i}`)],
          wordings: reviewed.map((data) => data.wording),
          certificateDate: reviewed[0]?.isoDate,
          disposition: req.query.download === '1' ? 'attachment' : 'inline',
        },
      });
      res.set(
        'Content-Disposition',
        certificateDisposition(
          certificateFilename(certificateRequest, {
            timeZone: res.locals.certificateTimeZone,
            kind: isFamily ? 'family' : 'packet',
            familyIndex: index,
          }),
          req.query.download === '1',
        ),
      );
      return res.type('pdf').send(bytes);
    } catch (error) {
      if (error instanceof CertificateDocumentError)
        return res
          .status(error.status)
          .json({ error: error.message, code: error.code });
      console.error('Could not generate retirement certificate document');
      return res
        .status(500)
        .json({ error: 'Could not generate retirement certificate document' });
    }
  },
);

function getCertificatePrintItems(certificateRequest) {
  const member = certificateRequest.member || {};
  const familyMembers = Array.isArray(certificateRequest.familyMembers)
    ? certificateRequest.familyMembers
    : [];

  return [
    {
      certificateKey: 'member',
      recipientName: cleanString(member.fullName),
    },
    ...(certificateRequest.certificateType === 'trusted_to_serve'
      ? []
      : familyMembers
    ).map((familyMember, index) => ({
      certificateKey: `family:${index}`,
      recipientName: cleanString(familyMember?.fullName),
    })),
  ];
}

function getPrintedCertificateKeys(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map(cleanString).filter(Boolean))];
}

function hasCompletePrintConfirmation(certificateRequest, printedKeys) {
  const expectedKeys = getCertificatePrintItems(certificateRequest).map(
    (item) => item.certificateKey,
  );

  return (
    printedKeys.length === expectedKeys.length &&
    expectedKeys.every((certificateKey) => printedKeys.includes(certificateKey))
  );
}

function serializeCertificateRequestStatus(certificateRequest) {
  return {
    id: certificateRequest._id,
    status: certificateRequest.status,
    printedAt: certificateRequest.printedAt,
    mailedAt: certificateRequest.mailedAt,
    fulfillmentRevision: certificateRequest.fulfillmentRevision ?? 0,
  };
}

function getRequestedStatus(value) {
  const requestedStatus = cleanString(value) || 'actionable';

  if (requestedStatus === 'all' || requestedStatus === 'actionable') {
    return 'all';
  }

  return CERTIFICATE_REQUEST_STATUSES.includes(requestedStatus)
    ? requestedStatus
    : null;
}

router.get(
  '/count',
  authMiddleware,
  requirePermission('canManageCertificateRequests'),
  async (req, res) => {
    try {
      const [pending, readyToMail] = await Promise.all([
        CertificateRequest.countDocuments({
          status: 'pending',
        }),
        CertificateRequest.countDocuments({
          status: { $in: ['ready_to_mail', 'printed'] },
        }),
      ]);

      res.json({
        pending,
        readyToMail,
        actionable: pending + readyToMail,
      });
    } catch (error) {
      console.error('Could not load certificate request count:', error);
      res.status(500).json({
        error: 'Could not load certificate request count',
      });
    }
  },
);

router.get(
  '/',
  authMiddleware,
  requirePermission('canManageCertificateRequests'),
  async (req, res) => {
    try {
      const requestedStatus = getRequestedStatus(req.query.status);

      if (!requestedStatus) {
        return res.status(400).json({
          error: 'Invalid certificate request status',
        });
      }

      const filter =
        cleanString(req.query.status) === 'actionable' || !req.query.status
          ? { status: { $in: CERTIFICATE_REQUEST_ACTIONABLE_STATUSES } }
          : requestedStatus === 'all'
            ? {}
            : { status: requestedStatus };
      const certificateRequests = await CertificateRequest.find(filter)
        .sort({
          'member.neededByDate': 1,
          createdAt: 1,
        })
        .lean();

      return res.json({
        certificateRequests: certificateRequests.map((certificateRequest) => ({
          ...certificateRequest,
          certificateCount: getCertificatePrintItems(certificateRequest).length,
          fulfillmentRevision: certificateRequest.fulfillmentRevision ?? 0,
        })),
        familyWordingOptions: FAMILY_WORDING_OPTIONS,
        familyRelationshipOptions: require('../config/certificate-requests')
          .CERTIFICATE_FAMILY_RELATIONSHIPS,
      });
    } catch (error) {
      console.error('Could not load certificate requests:', error);
      return res.status(500).json({
        error: 'Could not load certificate requests',
      });
    }
  },
);

function getNextFulfillmentStatus(status, field, checked) {
  const printed = ['ready_to_mail', 'printed', 'mailed'].includes(status);
  const mailed = status === 'mailed';
  if ((field === 'printed' ? printed : mailed) === checked) return status;
  if (field === 'printed') {
    if (checked && status === 'pending') return 'ready_to_mail';
    if (!checked && printed && !mailed) return 'pending';
  } else {
    if (checked && printed) return 'mailed';
    if (!checked && mailed) return 'ready_to_mail';
  }
  return null;
}

function updateFulfillment({ legacy = false } = {}) {
  return async (req, res) => {
    try {
      const { expectedStatus, expectedRevision } = req.body || {};
      const requestedStatus = legacy ? cleanString(req.body?.status) : null;
      const field = legacy
        ? requestedStatus === 'mailed'
          ? 'mailed'
          : 'printed'
        : req.body?.field;
      const checked = legacy ? true : req.body?.checked;
      if (
        legacy
          ? !['ready_to_mail', 'mailed'].includes(requestedStatus)
          : !['printed', 'mailed'].includes(field) ||
            typeof checked !== 'boolean' ||
            !CERTIFICATE_REQUEST_STATUSES.includes(expectedStatus) ||
            !Number.isSafeInteger(expectedRevision) ||
            expectedRevision < 0
      ) {
        return res.status(400).json({
          error: legacy
            ? 'Invalid certificate request status transition'
            : 'Invalid certificate request fulfillment update',
        });
      }

      const certificateRequest = await CertificateRequest.findById(
        req.params.certificateRequestId,
      ).lean();

      if (!certificateRequest) {
        return res.status(404).json({
          error: 'Certificate request not found',
        });
      }

      const previousStatus = certificateRequest.status;
      const revision = certificateRequest.fulfillmentRevision ?? 0;
      const stale = () =>
        res.status(409).json({
          error:
            'Certificate request fulfillment changed; reload and try again',
          code: 'certificate_request_fulfillment_stale',
        });
      if (
        !legacy &&
        (expectedStatus !== previousStatus || expectedRevision !== revision)
      )
        return stale();

      const nextStatus = getNextFulfillmentStatus(
        previousStatus,
        field,
        checked,
      );
      if (
        nextStatus === previousStatus &&
        (!legacy || requestedStatus === previousStatus)
      ) {
        return res.json({
          certificateRequest:
            serializeCertificateRequestStatus(certificateRequest),
        });
      }

      if (!nextStatus || (legacy && nextStatus !== requestedStatus)) {
        return res.status(409).json({
          error: legacy
            ? field === 'mailed'
              ? 'Certificate request must be ready to mail before mailing is confirmed'
              : 'Certificate request must be pending before printing is confirmed'
            : field === 'mailed'
              ? 'Confirm printing before confirming mailing'
              : 'Clear mailing before clearing printing',
          code: 'certificate_request_fulfillment_order',
        });
      }

      const confirmingPrint = field === 'printed' && checked;
      if (legacy && confirmingPrint) {
        const printedCertificateKeys = getPrintedCertificateKeys(
          req.body?.printedCertificateKeys,
        );

        if (
          !hasCompletePrintConfirmation(
            certificateRequest,
            printedCertificateKeys,
          )
        ) {
          return res.status(400).json({
            error: 'Confirm every requested certificate has been printed',
          });
        }
      }

      const actor = req.user._id;
      const at = new Date();
      // Compare the revision too: another staff member may have cleared and
      // reset the same checkbox while this confirmation dialog was open.
      const updated = await CertificateRequest.findOneAndUpdate(
        {
          _id: certificateRequest._id,
          status: previousStatus,
          fulfillmentRevision: revision === 0 ? { $in: [0, null] } : revision,
        },
        {
          $set: {
            status: nextStatus,
            updatedBy: actor,
            [`${field}By`]: checked ? actor : null,
            [`${field}At`]: checked ? at : null,
            ...(field === 'printed'
              ? {
                  printedCertificates: checked
                    ? getCertificatePrintItems(certificateRequest)
                    : [],
                }
              : {}),
            fulfillmentRevision: revision + 1,
          },
          $push: {
            fulfillmentHistory: {
              field,
              checked,
              previousStatus,
              status: nextStatus,
              actor,
              at,
            },
          },
        },
        { returnDocument: 'after', runValidators: true },
      ).lean();
      if (!updated) return stale();

      await writeAuditLog({
        req,
        action:
          field === 'printed'
            ? checked
              ? 'content.certificate_request_print_confirmed'
              : 'content.certificate_request_print_reversed'
            : checked
              ? 'content.certificate_request_mailed'
              : 'content.certificate_request_mail_reversed',
        actor: req.user,
        targetType: 'certificateRequest',
        target: updated._id,
        targetSnapshot: getCertificateRequestSnapshot(updated),
        metadata: {
          previousStatus,
          status: nextStatus,
          field,
          checked,
          at,
          certificateCount: confirmingPrint
            ? updated.printedCertificates.length
            : undefined,
        },
      });

      return res.json({
        certificateRequest: serializeCertificateRequestStatus(updated),
      });
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(404).json({
          error: 'Certificate request not found',
        });
      }

      console.error(
        'Could not update certificate request fulfillment status:',
        error,
      );
      return res.status(500).json({
        error: 'Could not update certificate request fulfillment status',
      });
    }
  };
}

router.patch(
  '/:certificateRequestId/status',
  authMiddleware,
  requirePermission('canManageCertificateRequests'),
  updateFulfillment({ legacy: true }),
);

router.patch(
  '/:certificateRequestId/fulfillment',
  authMiddleware,
  requirePermission('canManageCertificateRequests'),
  updateFulfillment(),
);

module.exports = router;
