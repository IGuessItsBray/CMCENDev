const express = require('express');
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

      return res.json({ certificateRequests });
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
          certificateRequest: serializeCertificateRequestStatus(certificateRequest),
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
        certificateRequest.printedCertificates = getCertificatePrintItems(
          certificateRequest,
        );
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
        certificateRequest: serializeCertificateRequestStatus(certificateRequest),
      });
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(404).json({
          error: 'Certificate request not found',
        });
      }

      console.error('Could not update certificate request fulfillment status:', error);
      return res.status(500).json({
        error: 'Could not update certificate request fulfillment status',
      });
    }
  },
);

module.exports = router;
