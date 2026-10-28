const express = require('express');
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

router.post(
  '/trusted-to-serve.pdf',
  (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  },
  authMiddleware,
  requirePermission('canManageCertificateRequests'),
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
          frPronoun: data.frPronoun,
          frRankGrammar: data.frRankGrammar,
          reviewed: req.body.reviewed === true,
          disposition: req.query.download === '1' ? 'attachment' : 'inline',
        },
      });
      res.set(
        'Content-Disposition',
        `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="trusted-to-serve-${data.isoDate}.pdf"`,
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
        `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="retirement-member-${certificateRequest._id}.pdf"`,
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
      const kind = isFamily ? `family-${index}` : 'packet';
      res.set(
        'Content-Disposition',
        `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="retirement-${kind}-${certificateRequest._id}.pdf"`,
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
    ...familyMembers.map((familyMember, index) => ({
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
        certificateRequests,
        familyWordingOptions: FAMILY_WORDING_OPTIONS,
      });
    } catch (error) {
      console.error('Could not load certificate requests:', error);
      return res.status(500).json({
        error: 'Could not load certificate requests',
      });
    }
  },
);

router.patch(
  '/:certificateRequestId/status',
  authMiddleware,
  requirePermission('canManageCertificateRequests'),
  async (req, res) => {
    try {
      const requestedStatus = cleanString(req.body?.status);

      if (!['ready_to_mail', 'mailed'].includes(requestedStatus)) {
        return res.status(400).json({
          error: 'Invalid certificate request status transition',
        });
      }

      const certificateRequest = await CertificateRequest.findById(
        req.params.certificateRequestId,
      );

      if (!certificateRequest) {
        return res.status(404).json({
          error: 'Certificate request not found',
        });
      }

      if (certificateRequest.status === requestedStatus) {
        return res.json({
          certificateRequest:
            serializeCertificateRequestStatus(certificateRequest),
        });
      }

      const previousStatus = certificateRequest.status;
      const isConfirmingPrint = requestedStatus === 'ready_to_mail';
      const canConfirmPrint = certificateRequest.status === 'pending';
      const canConfirmMail =
        certificateRequest.status === 'ready_to_mail' ||
        certificateRequest.status === 'printed';

      if (
        (isConfirmingPrint && !canConfirmPrint) ||
        (!isConfirmingPrint && !canConfirmMail)
      ) {
        return res.status(409).json({
          error: isConfirmingPrint
            ? 'Certificate request must be pending before printing is confirmed'
            : 'Certificate request must be ready to mail before mailing is confirmed',
        });
      }

      if (isConfirmingPrint) {
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

        certificateRequest.status = 'ready_to_mail';
        certificateRequest.printedBy = req.user._id;
        certificateRequest.printedAt = new Date();
        certificateRequest.printedCertificates =
          getCertificatePrintItems(certificateRequest);
      } else {
        certificateRequest.status = 'mailed';
        certificateRequest.mailedBy = req.user._id;
        certificateRequest.mailedAt = new Date();
      }

      certificateRequest.updatedBy = req.user._id;
      await certificateRequest.save();

      await writeAuditLog({
        req,
        action: isConfirmingPrint
          ? 'content.certificate_request_print_confirmed'
          : 'content.certificate_request_mailed',
        actor: req.user,
        targetType: 'certificateRequest',
        target: certificateRequest._id,
        targetSnapshot: getCertificateRequestSnapshot(certificateRequest),
        metadata: {
          previousStatus,
          status: certificateRequest.status,
          certificateCount: isConfirmingPrint
            ? certificateRequest.printedCertificates.length
            : undefined,
        },
      });

      return res.json({
        certificateRequest:
          serializeCertificateRequestStatus(certificateRequest),
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
  },
);

module.exports = router;
