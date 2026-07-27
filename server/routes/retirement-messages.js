const express = require('express');
const mongoose = require('mongoose');
const RetirementMessage = require('../models/RetirementMessage');
const RetirementComment = require('../models/RetirementComment');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { getUserPermissions } = require('../config/permissions');
const { RETIREMENT_TRADE_ROLES } = require('../config/content');
const { writeAuditLog } = require('../services/audit-log');
const {
  getRetirementCommentSnapshot,
  getRetirementMessageSnapshot,
} = require('../services/content-snapshots');
const { linkMediaAssetToSource } = require('../services/media-assets');
const {
  cleanLocalizedText,
  cleanString,
  getValidationErrorMessage,
  parseAffirmativeBoolean,
  parseDateOnly,
} = require('../services/content-utils');

const router = express.Router();

const ALLOWED_RELATIONSHIPS = ['self', 'colleague', 'family', 'other'];

const ALLOWED_LANGUAGES = ['en', 'fr'];

const DEFAULT_RETIREMENT_PAGE_SIZE = 24;
const MAX_RETIREMENT_PAGE_SIZE = 48;

function getRetirementPageSize(value) {
  const requestedSize = Number.parseInt(value, 10);

  if (!Number.isInteger(requestedSize) || requestedSize < 1) {
    return DEFAULT_RETIREMENT_PAGE_SIZE;
  }

  return Math.min(requestedSize, MAX_RETIREMENT_PAGE_SIZE);
}

function encodeRetirementCursor(retirementMessage) {
  return Buffer.from(
    JSON.stringify({
      id: String(retirementMessage._id),
      publishedAt: retirementMessage.publishedAt
        ? new Date(retirementMessage.publishedAt).toISOString()
        : null,
    }),
  ).toString('base64url');
}

function decodeRetirementCursor(value) {
  const cursor = cleanString(value);

  if (!cursor) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );

    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      return undefined;
    }

    if (decoded.publishedAt === null) {
      return {
        id: new mongoose.Types.ObjectId(decoded.id),
        publishedAt: null,
      };
    }

    const publishedAt = new Date(decoded.publishedAt);

    if (Number.isNaN(publishedAt.getTime())) {
      return undefined;
    }

    return {
      id: new mongoose.Types.ObjectId(decoded.id),
      publishedAt,
    };
  } catch (error) {
    return undefined;
  }
}

function getRetirementCursorFilter(cursor) {
  if (!cursor) {
    return {};
  }

  if (!cursor.publishedAt) {
    return {
      publishedAt: null,
      _id: { $lt: cursor.id },
    };
  }

  return {
    $or: [
      {
        publishedAt: { $lt: cursor.publishedAt },
      },
      {
        publishedAt: cursor.publishedAt,
        _id: { $lt: cursor.id },
      },
      {
        publishedAt: null,
      },
    ],
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getLocalizedMessages(retirementMessage) {
  const storedMessages =
    retirementMessage.messages?.toObject?.() ||
    retirementMessage.messages ||
    {};

  const cleanMessages = cleanLocalizedText(storedMessages);

  const originalLanguage = retirementMessage.messageLanguage;

  if (
    ALLOWED_LANGUAGES.includes(originalLanguage) &&
    !cleanMessages[originalLanguage] &&
    cleanString(retirementMessage.message)
  ) {
    cleanMessages[originalLanguage] = cleanString(retirementMessage.message);
  }

  return cleanMessages;
}

function getRetirementMessageText(retirementMessage, language = 'en') {
  const messages = getLocalizedMessages(retirementMessage);

  return (
    cleanString(messages[language]) ||
    cleanString(messages.en) ||
    cleanString(messages.fr) ||
    cleanString(retirementMessage.message)
  );
}

function getRetireeDisplayName(retirementMessage) {
  const retiree = retirementMessage?.retiree || {};
  const name = [
    cleanString(retiree.rank),
    cleanString(retiree.firstName),
    cleanString(retiree.lastName),
  ]
    .filter(Boolean)
    .join(' ');
  const postNominals = cleanString(retiree.postNominals);

  return (
    [name, postNominals].filter(Boolean).join(', ') || 'Retirement message'
  );
}

async function linkRetirementPhotoToMediaAsset(retirementMessage) {
  await linkMediaAssetToSource({
    mediaUrl: retirementMessage.photoUrl,
    sourceType: 'retirementMessage',
    context: 'retirement-message',
    sourceModel: 'RetirementMessage',
    sourceId: retirementMessage._id,
    sourceField: 'photoUrl',
    sourceUrl: `/retirement-message?id=${encodeURIComponent(String(retirementMessage._id))}`,
    inferredName: getRetireeDisplayName(retirementMessage),
  });
}

function getSubmitterFromUser(user = {}) {
  return {
    firstName: cleanString(user.firstName),
    lastName: cleanString(user.lastName),
    email: cleanString(user.email).toLowerCase(),
    unit: cleanString(user.currentUnit || user.company),
  };
}

function fillSubmitterDetailsFromProfile(submitter = {}, user = {}) {
  const profileSubmitter = getSubmitterFromUser(user);

  return {
    firstName: cleanString(submitter.firstName) || profileSubmitter.firstName,
    lastName: cleanString(submitter.lastName) || profileSubmitter.lastName,
    email: cleanString(submitter.email).toLowerCase() || profileSubmitter.email,
    unit: cleanString(submitter.unit) || profileSubmitter.unit,
  };
}

function getCleanRetirementMessagePayload(body = {}, submitterDetails = {}) {
  const {
    retiree = {},
    message,
    messageLanguage,
    photoUrl,
    submitter = {},
    publicationConsentConfirmed,
    memberReviewConfirmed,
  } = body;

  const cleanRetiree = {
    rank: cleanString(retiree.rank),
    firstName: cleanString(retiree.firstName),
    lastName: cleanString(retiree.lastName),
    postNominals: cleanString(retiree.postNominals),
    tradeRole: cleanString(retiree.tradeRole),
    retirementDate: parseDateOnly(retiree.retirementDate),
  };

  const cleanMessage = cleanString(message);
  const cleanSubmitter = {
    firstName: cleanString(submitterDetails.firstName),
    lastName: cleanString(submitterDetails.lastName),
    relationship: cleanString(submitter.relationship),
    email: cleanString(submitterDetails.email).toLowerCase(),
    unit: cleanString(submitterDetails.unit),
  };

  return {
    cleanRetiree,
    cleanMessage,
    cleanMessages: cleanLocalizedText({
      [messageLanguage]: cleanMessage,
    }),
    cleanPhotoUrl: cleanString(photoUrl),
    cleanSubmitter,
    messageLanguage,
    consentConfirmed: parseAffirmativeBoolean(publicationConsentConfirmed),
    memberReviewWasConfirmed: parseAffirmativeBoolean(memberReviewConfirmed),
  };
}

function validateRetirementMessagePayload(payload) {
  const {
    cleanRetiree,
    cleanMessage,
    cleanPhotoUrl,
    cleanSubmitter,
    messageLanguage,
    consentConfirmed,
    memberReviewWasConfirmed,
  } = payload;

  if (
    !cleanRetiree.rank ||
    !cleanRetiree.firstName ||
    !cleanRetiree.lastName ||
    !cleanRetiree.tradeRole ||
    !cleanRetiree.retirementDate
  ) {
    return 'Required retiree information is missing';
  }

  if (!RETIREMENT_TRADE_ROLES.includes(cleanRetiree.tradeRole)) {
    return 'The retiree MOSID or role is invalid';
  }

  if (cleanMessage.length < 100) {
    return 'The retirement message must contain at least 100 characters';
  }

  if (!ALLOWED_LANGUAGES.includes(messageLanguage)) {
    return 'The message language is invalid';
  }

  if (cleanPhotoUrl.length > 2000) {
    return 'The photo URL is too long';
  }

  if (
    !cleanSubmitter.firstName ||
    !cleanSubmitter.lastName ||
    !cleanSubmitter.email ||
    !cleanSubmitter.unit
  ) {
    return 'Required submitter information is missing';
  }

  if (!ALLOWED_RELATIONSHIPS.includes(cleanSubmitter.relationship)) {
    return 'The submitter relationship is invalid';
  }

  if (!isValidEmail(cleanSubmitter.email)) {
    return 'A valid submitter email is required';
  }

  if (!memberReviewWasConfirmed) {
    return 'The releasing member review must be confirmed';
  }

  if (!consentConfirmed) {
    return 'The releasing member publication acknowledgement must be confirmed';
  }

  return '';
}

router.post(
  '/',
  authMiddleware,
  requirePermission('canSubmitRetirementMessages'),
  async (req, res) => {
    try {
      const { website } = req.body;

      /*
       * Bots commonly fill every input. Return the
       * normal success response without storing anything.
       */
      if (cleanString(website)) {
        return res.status(201).json({
          message: 'Retirement message submitted for review',
        });
      }

      const profileSubmitter = getSubmitterFromUser(req.user);
      const missingProfileFields = [
        ['firstName', 'Submitter first name'],
        ['lastName', 'Submitter last name'],
        ['email', 'Submitter email'],
        ['unit', 'Submitter unit or organization'],
      ];

      for (const [field, label] of missingProfileFields) {
        if (!profileSubmitter[field]) {
          return res.status(400).json({
            error: `Complete your profile before submitting a retirement message: ${label} is required`,
          });
        }
      }

      const payload = getCleanRetirementMessagePayload(
        req.body,
        profileSubmitter,
      );
      const validationError = validateRetirementMessagePayload(payload);

      if (validationError) {
        return res.status(400).json({
          error: validationError,
        });
      }

      const {
        cleanRetiree,
        cleanMessage,
        cleanMessages,
        cleanPhotoUrl,
        cleanSubmitter,
        messageLanguage,
      } = payload;

      const confirmationDate = new Date();

      const permissions = getUserPermissions(req.user);

      const bypassesReview = permissions.canBypassReviewStages === true;

      const retirementMessage = new RetirementMessage({
        retiree: cleanRetiree,

        message: cleanMessage,

        messageLanguage,

        messages: cleanMessages,

        photoUrl: cleanPhotoUrl,

        submitter: cleanSubmitter,

        publicationConsent: {
          confirmed: true,
          confirmedAt: confirmationDate,
        },

        memberReviewConfirmation: {
          confirmed: true,
          confirmedAt: confirmationDate,
        },

        createdBy: req.user._id,

        updatedBy: req.user._id,

        status: bypassesReview ? 'published' : 'pending',

        reviewedBy: bypassesReview ? req.user._id : null,

        reviewedAt: bypassesReview ? confirmationDate : null,

        publishedBy: bypassesReview ? req.user._id : null,

        publishedAt: bypassesReview ? confirmationDate : null,
      });

      await retirementMessage.save();
      await linkRetirementPhotoToMediaAsset(retirementMessage);

      await writeAuditLog({
        req,
        action: 'content.created',
        actor: req.user,
        targetType: 'retirementMessage',
        target: retirementMessage._id,
        targetSnapshot: getRetirementMessageSnapshot(retirementMessage),
        metadata: { status: retirementMessage.status },
      });

      if (retirementMessage.status === 'published') {
        await writeAuditLog({
          req,
          action: 'content.published',
          actor: req.user,
          targetType: 'retirementMessage',
          target: retirementMessage._id,
          targetSnapshot: getRetirementMessageSnapshot(retirementMessage),
          metadata: { source: 'create' },
        });
      }

      return res.status(201).json({
        message: bypassesReview
          ? 'Retirement message published successfully'
          : 'Retirement message submitted for review',

        status: retirementMessage.status,
      });
    } catch (error) {
      console.error('Could not submit retirement message:', error);

      return res.status(500).json({
        error: 'Could not submit retirement message',
      });
    }
  },
);

router.get('/', async (req, res) => {
  try {
    const pageSize = getRetirementPageSize(req.query.limit);
    const cursor = decodeRetirementCursor(req.query.cursor);

    if (cursor === undefined) {
      return res.status(400).json({
        error: 'Invalid retirement message cursor',
      });
    }

    const retirementMessagesWithExtra = await RetirementMessage.find({
      status: 'published',
      ...getRetirementCursorFilter(cursor),
    })
      .select({
        retiree: 1,
        photoUrl: 1,
        publishedAt: 1,
      })
      .sort({
        publishedAt: -1,
        _id: -1,
      })
      .limit(pageSize + 1)
      .lean();

    const hasMore = retirementMessagesWithExtra.length > pageSize;
    const retirementMessages = hasMore
      ? retirementMessagesWithExtra.slice(0, pageSize)
      : retirementMessagesWithExtra;

    const commentCounts = await RetirementComment.aggregate([
      {
        $match: {
          status: 'published',
          retirementMessage: {
            $in: retirementMessages.map(
              (retirementMessage) => retirementMessage._id,
            ),
          },
        },
      },
      {
        $group: {
          _id: '$retirementMessage',
          count: { $sum: 1 },
        },
      },
    ]);

    const commentCountByMessage = new Map(
      commentCounts.map((item) => [String(item._id), item.count]),
    );

    res.json({
      retirementMessages: retirementMessages.map((retirementMessage) => ({
        ...retirementMessage,
        commentCount:
          commentCountByMessage.get(String(retirementMessage._id)) || 0,
      })),
      hasMore,
      nextCursor:
        hasMore && retirementMessages.length
          ? encodeRetirementCursor(
              retirementMessages[retirementMessages.length - 1],
            )
          : '',
    });
  } catch (error) {
    console.error('Could not load retirement messages:', error);

    res.status(500).json({
      error: 'Could not load retirement messages',
    });
  }
});

router.get(
  '/review',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const allowedStatuses = ['pending', 'rejected', 'published'];

      const requestedStatus =
        typeof req.query.status === 'string' ? req.query.status : 'pending';

      if (!allowedStatuses.includes(requestedStatus)) {
        return res.status(400).json({
          error: 'Invalid review status',
        });
      }

      const retirementMessages = await RetirementMessage.find({
        status: requestedStatus,
      })
        .populate('reviewedBy', 'username accountName email role')
        .populate('publishedBy', 'username accountName role')
        .sort({
          createdAt: 1,
        })
        .lean();

      res.json({
        status: requestedStatus,
        retirementMessages,
      });
    } catch (error) {
      console.error('Could not load retirement message review queue:', error);

      res.status(500).json({
        error: 'Could not load retirement message review queue',
      });
    }
  },
);

router.get(
  '/comments/review',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const allowedStatuses = ['pending', 'rejected', 'published'];

      const requestedStatus =
        typeof req.query.status === 'string' ? req.query.status : 'pending';

      if (!allowedStatuses.includes(requestedStatus)) {
        return res.status(400).json({
          error: 'Invalid review status',
        });
      }

      const comments = await RetirementComment.find({
        status: requestedStatus,
      })
        .populate(
          'author',
          'username accountName firstName lastName email role',
        )
        .populate('reviewedBy', 'username accountName email role')
        .populate('retirementMessage', 'retiree status')
        .sort({
          createdAt: 1,
        })
        .lean();

      res.json({
        status: requestedStatus,
        comments,
      });
    } catch (error) {
      console.error('Could not load retirement comment review queue:', error);

      res.status(500).json({
        error: 'Could not load retirement comment review queue',
      });
    }
  },
);

router.patch(
  '/comments/:commentId/review',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const { action, rejectionReason } = req.body;

      if (!['publish', 'reject'].includes(action)) {
        return res.status(400).json({
          error: 'Review action must be publish or reject',
        });
      }

      const comment = await RetirementComment.findById(req.params.commentId);

      if (!comment) {
        return res.status(404).json({
          error: 'Retirement comment not found',
        });
      }

      if (comment.status !== 'pending') {
        return res.status(409).json({
          error: 'Only pending retirement comments can be reviewed',
        });
      }

      const reviewDate = new Date();

      if (action === 'reject') {
        const cleanReason = cleanString(rejectionReason);

        if (!cleanReason) {
          return res.status(400).json({
            error: 'A rejection reason is required',
          });
        }

        comment.status = 'rejected';
        comment.rejectionReason = cleanReason;
        comment.publishedBy = null;
        comment.publishedAt = null;
      }

      if (action === 'publish') {
        comment.status = 'published';
        comment.rejectionReason = '';
        comment.publishedBy = req.user._id;
        comment.publishedAt = reviewDate;
      }

      comment.reviewedBy = req.user._id;
      comment.reviewedAt = reviewDate;

      await comment.save();

      if (action === 'publish') {
        await writeAuditLog({
          req,
          action: 'content.published',
          actor: req.user,
          targetType: 'retirementComment',
          target: comment._id,
          targetSnapshot: getRetirementCommentSnapshot(comment),
          metadata: { source: 'review' },
        });
      }

      if (action === 'reject') {
        await writeAuditLog({
          req,
          action: 'content.rejected',
          actor: req.user,
          targetType: 'retirementComment',
          target: comment._id,
          targetSnapshot: getRetirementCommentSnapshot(comment),
          metadata: {
            source: 'review',
            rejectionReason: comment.rejectionReason,
          },
        });
      }

      await comment.populate(
        'author',
        'username accountName firstName lastName email role',
      );

      await comment.populate('reviewedBy', 'username accountName email role');

      await comment.populate('publishedBy', 'username accountName email role');

      await comment.populate('retirementMessage', 'retiree status');

      res.json({
        message:
          action === 'publish'
            ? 'Comment published successfully'
            : 'Comment rejected',

        comment,
      });
    } catch (error) {
      console.error('Could not review retirement comment:', error);

      if (error.name === 'CastError') {
        return res.status(400).json({
          error: 'Invalid retirement comment ID',
        });
      }

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: getValidationErrorMessage(error),
        });
      }

      res.status(500).json({
        error: 'Could not review retirement comment',
      });
    }
  },
);

router.get('/comments/:commentId/edit', authMiddleware, async (req, res) => {
  try {
    const comment = await RetirementComment.findById(req.params.commentId)
      .populate('retirementMessage', 'retiree status')
      .lean();

    if (!comment) {
      return res.status(404).json({
        error: 'Retirement comment not found',
      });
    }

    const permissions = getUserPermissions(req.user);
    const isOwner =
      comment.author && String(comment.author) === String(req.user._id);
    const canReview = permissions.canReviewAndPublish === true;

    if (!isOwner && !canReview) {
      return res.status(403).json({
        error: 'You do not have permission to edit this comment',
      });
    }

    res.json({ comment });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({
        error: 'Retirement comment not found',
      });
    }

    console.error('Could not load retirement comment for editing:', error);

    res.status(500).json({
      error: 'Could not load retirement comment for editing',
    });
  }
});

router.patch('/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const cleanBody = cleanString(req.body?.body);

    if (cleanBody.length < 2) {
      return res.status(400).json({
        error: 'Comment must contain at least 2 characters',
      });
    }

    if (cleanBody.length > 2000) {
      return res.status(400).json({
        error: 'Comment must be 2000 characters or fewer',
      });
    }

    const comment = await RetirementComment.findById(req.params.commentId);

    if (!comment) {
      return res.status(404).json({
        error: 'Retirement comment not found',
      });
    }

    const permissions = getUserPermissions(req.user);
    const isOwner =
      comment.author && String(comment.author) === String(req.user._id);
    const canReview = permissions.canReviewAndPublish === true;

    if (!isOwner && !canReview) {
      return res.status(403).json({
        error: 'You do not have permission to edit this comment',
      });
    }

    comment.body = cleanBody;
    comment.status =
      canReview && permissions.canPublishOwnContent === true
        ? 'published'
        : 'pending';
    comment.rejectionReason = '';
    comment.reviewedBy = comment.status === 'published' ? req.user._id : null;
    comment.reviewedAt = comment.status === 'published' ? new Date() : null;
    comment.publishedBy = comment.status === 'published' ? req.user._id : null;
    comment.publishedAt = comment.status === 'published' ? new Date() : null;

    await comment.save();
    await comment.populate('retirementMessage', 'retiree status');

    await writeAuditLog({
      req,
      action: 'content.created',
      actor: req.user,
      targetType: 'retirementComment',
      target: comment._id,
      targetSnapshot: getRetirementCommentSnapshot(comment),
      metadata: {
        source: 'resubmit',
        status: comment.status,
      },
    });

    res.json({
      message:
        comment.status === 'published'
          ? 'Comment updated and published'
          : 'Comment updated and submitted for review',
      comment,
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({
        error: 'Retirement comment not found',
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: getValidationErrorMessage(error),
      });
    }

    console.error('Could not update retirement comment:', error);

    res.status(500).json({
      error: 'Could not update retirement comment',
    });
  }
});

router.get('/:messageId/edit', authMiddleware, async (req, res) => {
  try {
    const retirementMessage = await RetirementMessage.findById(
      req.params.messageId,
    ).lean();

    if (!retirementMessage) {
      return res.status(404).json({
        error: 'Retirement message not found',
      });
    }

    const permissions = getUserPermissions(req.user);
    const isOwner =
      retirementMessage.createdBy &&
      String(retirementMessage.createdBy) === String(req.user._id);
    const canReview = permissions.canReviewAndPublish === true;

    if (!isOwner && !canReview) {
      return res.status(403).json({
        error: 'You do not have permission to edit this retirement message',
      });
    }

    res.json({ retirementMessage });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({
        error: 'Retirement message not found',
      });
    }

    console.error('Could not load retirement message for editing:', error);

    res.status(500).json({
      error: 'Could not load retirement message for editing',
    });
  }
});

router.patch('/:messageId', authMiddleware, async (req, res) => {
  try {
    const retirementMessage = await RetirementMessage.findById(
      req.params.messageId,
    );

    if (!retirementMessage) {
      return res.status(404).json({
        error: 'Retirement message not found',
      });
    }

    const permissions = getUserPermissions(req.user);
    const isOwner =
      retirementMessage.createdBy &&
      String(retirementMessage.createdBy) === String(req.user._id);
    const canReview = permissions.canReviewAndPublish === true;

    if (!isOwner && !canReview) {
      return res.status(403).json({
        error: 'You do not have permission to edit this retirement message',
      });
    }

    const submitterDetails = fillSubmitterDetailsFromProfile(
      retirementMessage.submitter,
      req.user,
    );
    const payload = getCleanRetirementMessagePayload(
      req.body,
      submitterDetails,
    );
    const validationError = validateRetirementMessagePayload(payload);

    if (validationError) {
      return res.status(400).json({
        error: validationError,
      });
    }

    const {
      cleanRetiree,
      cleanMessage,
      cleanMessages,
      cleanPhotoUrl,
      cleanSubmitter,
      messageLanguage,
    } = payload;
    const now = new Date();

    retirementMessage.retiree = cleanRetiree;
    retirementMessage.message = cleanMessage;
    retirementMessage.messageLanguage = messageLanguage;
    retirementMessage.messages = cleanMessages;
    retirementMessage.photoUrl = cleanPhotoUrl;
    retirementMessage.submitter = cleanSubmitter;
    retirementMessage.publicationConsent = {
      confirmed: true,
      confirmedAt: now,
    };
    retirementMessage.memberReviewConfirmation = {
      confirmed: true,
      confirmedAt: now,
    };
    retirementMessage.updatedBy = req.user._id;
    retirementMessage.status =
      canReview && permissions.canBypassReviewStages === true
        ? 'published'
        : 'pending';
    retirementMessage.rejectionReason = '';
    retirementMessage.reviewedBy =
      retirementMessage.status === 'published' ? req.user._id : null;
    retirementMessage.reviewedAt =
      retirementMessage.status === 'published' ? now : null;
    retirementMessage.publishedBy =
      retirementMessage.status === 'published' ? req.user._id : null;
    retirementMessage.publishedAt =
      retirementMessage.status === 'published' ? now : null;

    await retirementMessage.save();
    await linkRetirementPhotoToMediaAsset(retirementMessage);

    await writeAuditLog({
      req,
      action: 'content.created',
      actor: req.user,
      targetType: 'retirementMessage',
      target: retirementMessage._id,
      targetSnapshot: getRetirementMessageSnapshot(retirementMessage),
      metadata: {
        source: 'resubmit',
        status: retirementMessage.status,
      },
    });

    res.json({
      message:
        retirementMessage.status === 'published'
          ? 'Retirement message updated and published'
          : 'Retirement message updated and submitted for review',
      retirementMessage,
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({
        error: 'Retirement message not found',
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: getValidationErrorMessage(error),
      });
    }

    console.error('Could not update retirement message:', error);

    res.status(500).json({
      error: 'Could not update retirement message',
    });
  }
});

router.get('/:messageId/comments', async (req, res) => {
  try {
    const retirementMessage = await RetirementMessage.findOne({
      _id: req.params.messageId,
      status: 'published',
    })
      .select({ _id: 1 })
      .lean();

    if (!retirementMessage) {
      return res.status(404).json({
        error: 'Retirement message not found',
      });
    }

    const comments = await RetirementComment.find({
      retirementMessage: req.params.messageId,
      status: 'published',
    })
      .populate('author', 'username accountName firstName lastName role')
      .sort({
        publishedAt: 1,
        createdAt: 1,
      })
      .lean();

    res.json({
      comments,
    });
  } catch (error) {
    console.error('Could not load retirement comments:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid retirement message ID',
      });
    }

    res.status(500).json({
      error: 'Could not load retirement comments',
    });
  }
});

router.post('/:messageId/comments', authMiddleware, async (req, res) => {
  try {
    const cleanBody = cleanString(req.body?.body);

    if (cleanBody.length < 2) {
      return res.status(400).json({
        error: 'Comment must contain at least 2 characters',
      });
    }

    if (cleanBody.length > 2000) {
      return res.status(400).json({
        error: 'Comment must be 2000 characters or fewer',
      });
    }

    const retirementMessage = await RetirementMessage.findOne({
      _id: req.params.messageId,
      status: 'published',
    })
      .select({ _id: 1 })
      .lean();

    if (!retirementMessage) {
      return res.status(404).json({
        error: 'Retirement message not found',
      });
    }

    const permissions = getUserPermissions(req.user);

    const publishImmediately = permissions.canPublishOwnContent === true;

    const now = new Date();

    const comment = new RetirementComment({
      retirementMessage: retirementMessage._id,

      author: req.user._id,

      body: cleanBody,

      status: publishImmediately ? 'published' : 'pending',

      reviewedBy: publishImmediately ? req.user._id : null,

      reviewedAt: publishImmediately ? now : null,

      publishedBy: publishImmediately ? req.user._id : null,

      publishedAt: publishImmediately ? now : null,
    });

    await comment.save();

    await writeAuditLog({
      req,
      action: 'content.created',
      actor: req.user,
      targetType: 'retirementComment',
      target: comment._id,
      targetSnapshot: getRetirementCommentSnapshot(comment),
      metadata: { status: comment.status },
    });

    if (comment.status === 'published') {
      await writeAuditLog({
        req,
        action: 'content.published',
        actor: req.user,
        targetType: 'retirementComment',
        target: comment._id,
        targetSnapshot: getRetirementCommentSnapshot(comment),
        metadata: { source: 'create' },
      });
    }

    await comment.populate(
      'author',
      'username accountName firstName lastName role',
    );

    res.status(201).json({
      message: publishImmediately
        ? 'Comment published successfully'
        : 'Comment submitted for review',

      status: comment.status,

      comment: comment.status === 'published' ? comment : null,
    });
  } catch (error) {
    console.error('Could not submit retirement comment:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid retirement message ID',
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: getValidationErrorMessage(error),
      });
    }

    res.status(500).json({
      error: 'Could not submit retirement comment',
    });
  }
});

router.get('/:messageId', async (req, res) => {
  try {
    const retirementMessage = await RetirementMessage.findOne({
      _id: req.params.messageId,
      status: 'published',
    })
      .select({
        retiree: 1,
        message: 1,
        messageLanguage: 1,
        messages: 1,
        photoUrl: 1,
        publishedAt: 1,
      })
      .lean();

    if (!retirementMessage) {
      return res.status(404).json({
        error: 'Retirement message not found',
      });
    }

    res.json({
      retirementMessage: {
        ...retirementMessage,
        messages: getLocalizedMessages(retirementMessage),
      },
    });
  } catch (error) {
    console.error('Could not load retirement message:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid retirement message ID',
      });
    }

    res.status(500).json({
      error: 'Could not load retirement message',
    });
  }
});

router.patch(
  '/:messageId/review',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const { action, rejectionReason, messages } = req.body;

      if (!['publish', 'reject'].includes(action)) {
        return res.status(400).json({
          error: 'Review action must be publish or reject',
        });
      }

      const retirementMessage = await RetirementMessage.findById(
        req.params.messageId,
      );

      if (!retirementMessage) {
        return res.status(404).json({
          error: 'Retirement message not found',
        });
      }

      if (retirementMessage.status !== 'pending') {
        return res.status(409).json({
          error: 'Only pending retirement messages can be reviewed',
        });
      }

      const reviewDate = new Date();

      if (action === 'reject') {
        const cleanReason =
          typeof rejectionReason === 'string' ? rejectionReason.trim() : '';

        if (!cleanReason) {
          return res.status(400).json({
            error: 'A rejection reason is required',
          });
        }

        retirementMessage.status = 'rejected';
        retirementMessage.rejectionReason = cleanReason;
        retirementMessage.publishedBy = null;
        retirementMessage.publishedAt = null;
      }

      if (action === 'publish') {
        const cleanMessages = cleanLocalizedText({
          ...getLocalizedMessages(retirementMessage),
          ...messages,
        });

        const originalLanguage = retirementMessage.messageLanguage;

        if (
          !cleanMessages[originalLanguage] &&
          cleanString(retirementMessage.message)
        ) {
          cleanMessages[originalLanguage] = cleanString(
            retirementMessage.message,
          );
        }

        if (cleanMessages.en.length < 100 || cleanMessages.fr.length < 100) {
          return res.status(400).json({
            error:
              'English and French retirement messages must each contain at least 100 characters before publication',
          });
        }

        retirementMessage.set('messages.en', cleanMessages.en);
        retirementMessage.set('messages.fr', cleanMessages.fr);
        retirementMessage.markModified('messages');

        retirementMessage.message = getRetirementMessageText(
          {
            message: retirementMessage.message,
            messages: cleanMessages,
          },
          originalLanguage,
        );

        retirementMessage.status = 'published';
        retirementMessage.rejectionReason = null;
        retirementMessage.publishedBy = req.user._id;
        retirementMessage.publishedAt = reviewDate;
      }

      retirementMessage.reviewedBy = req.user._id;
      retirementMessage.reviewedAt = reviewDate;
      retirementMessage.updatedBy = req.user._id;

      await retirementMessage.save();

      if (action === 'publish') {
        await writeAuditLog({
          req,
          action: 'content.published',
          actor: req.user,
          targetType: 'retirementMessage',
          target: retirementMessage._id,
          targetSnapshot: getRetirementMessageSnapshot(retirementMessage),
          metadata: { source: 'review' },
        });
      }

      if (action === 'reject') {
        await writeAuditLog({
          req,
          action: 'content.rejected',
          actor: req.user,
          targetType: 'retirementMessage',
          target: retirementMessage._id,
          targetSnapshot: getRetirementMessageSnapshot(retirementMessage),
          metadata: {
            source: 'review',
            rejectionReason: retirementMessage.rejectionReason,
          },
        });
      }

      await retirementMessage.populate(
        'reviewedBy',
        'username accountName email role',
      );

      await retirementMessage.populate(
        'publishedBy',
        'username accountName role',
      );

      res.json({
        message:
          action === 'publish'
            ? 'Retirement message published successfully'
            : 'Retirement message rejected',

        retirementMessage,
      });
    } catch (error) {
      console.error('Could not review retirement message:', error);

      if (error.name === 'CastError') {
        return res.status(400).json({
          error: 'Invalid retirement message ID',
        });
      }

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: getValidationErrorMessage(error),
        });
      }

      res.status(500).json({
        error: 'Could not review retirement message',
      });
    }
  },
);

module.exports = router;
