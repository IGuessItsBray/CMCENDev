const express = require('express');
const mongoose = require('mongoose');
const LastPostMessage = require('../models/LastPostMessage');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { getUserPermissions } = require('../config/permissions');
const { writeAuditLog } = require('../services/audit-log');
const { recordContentRevision } = require('../services/content-revisions');
const { cleanString, parseBoolean } = require('../services/content-utils');
const { linkMediaAssetToSource } = require('../services/media-assets');

const router = express.Router();
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;

function getPageSize(value) {
  const requested = Number.parseInt(value, 10);

  if (!Number.isInteger(requested) || requested < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(requested, MAX_PAGE_SIZE);
}

function isValidImageUrl(value) {
  if (!value) return true;

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch (error) {
    return false;
  }
}

function encodeCursor(lastPost) {
  return Buffer.from(
    JSON.stringify({
      id: String(lastPost._id),
      publishedAt: lastPost.publishedAt
        ? new Date(lastPost.publishedAt).toISOString()
        : null,
    }),
  ).toString('base64url');
}

function decodeCursor(value) {
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

    const publishedAt = decoded.publishedAt
      ? new Date(decoded.publishedAt)
      : null;

    if (decoded.publishedAt && Number.isNaN(publishedAt.getTime())) {
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

function getCursorFilter(cursor) {
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
      { publishedAt: { $lt: cursor.publishedAt } },
      { publishedAt: cursor.publishedAt, _id: { $lt: cursor.id } },
      { publishedAt: null },
    ],
  };
}

function getDeceasedName(lastPost) {
  const deceased = lastPost.deceased || {};
  const name = [
    cleanString(deceased.fullRank),
    cleanString(deceased.firstName),
    cleanString(deceased.surname),
  ]
    .filter(Boolean)
    .join(' ');
  const postNominal = cleanString(deceased.postNominal);

  return [name, postNominal].filter(Boolean).join(', ') || 'In Memoriam';
}

function getLocalizedMessages(lastPost) {
  const storedMessages =
    lastPost.messages?.toObject?.() || lastPost.messages || {};
  const messages = {
    en: cleanString(storedMessages.en),
    fr: cleanString(storedMessages.fr),
  };
  return messages;
}

function getLastPostSnapshot(lastPost) {
  return {
    title: getDeceasedName(lastPost),
    status: lastPost.status,
    createdBy: lastPost.createdBy,
    publishedAt: lastPost.publishedAt,
  };
}

function serializeLastPost(lastPost) {
  const deceased = lastPost.deceased?.toObject?.() || lastPost.deceased || {};

  return {
    _id: lastPost._id,
    deceased: {
      fullRank: cleanString(deceased.fullRank),
      firstName: cleanString(deceased.firstName),
      surname: cleanString(deceased.surname),
      postNominal: cleanString(deceased.postNominal),
    },
    displayName: getDeceasedName(lastPost),
    messages: getLocalizedMessages(lastPost),
    imageUrl: cleanString(lastPost.imageUrl),
    imageDisplayUrl: cleanString(lastPost.imageDisplayUrl),
    publishedAt: lastPost.publishedAt || null,
  };
}

async function linkLastPostImageToMediaAsset(lastPost) {
  await linkMediaAssetToSource({
    mediaUrl: lastPost.imageUrl || lastPost.photoUrl,
    sourceType: 'lastPostMessage',
    context: 'last-post',
    sourceModel: 'LastPostMessage',
    sourceId: lastPost._id,
    sourceField: 'imageUrl',
    sourceUrl: `/last-post-message?id=${encodeURIComponent(String(lastPost._id))}`,
    inferredName: getDeceasedName(lastPost),
  });
}

router.post(
  '/',
  authMiddleware,
  requirePermission('canCreateDrafts'),
  async (req, res) => {
    try {
      const deceased = req.body?.deceased || {};
      const messageLanguage = cleanString(req.body?.messageLanguage);
      const message = cleanString(req.body?.message);
      const imageUrl = cleanString(req.body?.imageUrl);
      const imageDisplayUrl = cleanString(req.body?.imageDisplayUrl);
      const publicationPermissionConfirmed = parseBoolean(
        req.body?.publicationPermissionConfirmed,
        false,
      );
      const wantsImmediatePublication = parseBoolean(
        req.body?.publishNow,
        false,
      );
      const submitter = {
        rank: cleanString(req.user.rank),
        firstName: cleanString(req.user.firstName),
        lastName: cleanString(req.user.lastName),
        email: cleanString(req.user.email).toLowerCase(),
      };
      const cleanDeceased = {
        fullRank: cleanString(deceased.fullRank),
        firstName: cleanString(deceased.firstName),
        surname: cleanString(deceased.surname),
        postNominal: cleanString(deceased.postNominal),
      };

      if (Object.values(submitter).some((value) => !value)) {
        return res.status(400).json({
          error:
            'Complete your profile rank, name, and email before submitting a Last Post notice',
        });
      }

      if (
        !cleanDeceased.fullRank ||
        !cleanDeceased.firstName ||
        !cleanDeceased.surname
      ) {
        return res.status(400).json({
          error:
            'Full rank, first name, and surname are required for the deceased member',
        });
      }

      if (!['en', 'fr'].includes(messageLanguage)) {
        return res.status(400).json({
          error: 'Choose whether the notice was submitted in English or French',
        });
      }

      if (!message) {
        return res
          .status(400)
          .json({ error: 'A Last Post notice is required' });
      }

      if (!publicationPermissionConfirmed) {
        return res.status(400).json({
          error: 'Chain-of-command permission confirmation is required',
        });
      }

      if (message.length > 10000) {
        return res.status(400).json({
          error: 'The Last Post notice must be 10000 characters or fewer',
        });
      }

      if (!isValidImageUrl(imageUrl)) {
        return res.status(400).json({
          error: 'The image URL must begin with http:// or https://',
        });
      }

      if (!isValidImageUrl(imageDisplayUrl)) {
        return res.status(400).json({
          error: 'The display image URL must begin with http:// or https://',
        });
      }

      const permissions = getUserPermissions(req.user);
      const canPublishImmediately =
        permissions.canReviewAndPublish === true;

      if (wantsImmediatePublication && !canPublishImmediately) {
        return res.status(403).json({
          error: 'You do not have permission to publish Last Post notices immediately',
        });
      }

      const now = new Date();

      const lastPost = await LastPostMessage.create({
        submitter,
        deceased: cleanDeceased,
        messageLanguage,
        messages: {
          [messageLanguage]: message,
        },
        imageUrl,
        imageDisplayUrl,
        publicationPermission: {
          confirmed: true,
          confirmedAt: now,
          confirmedBy: req.user._id,
        },
        status: wantsImmediatePublication ? 'published' : 'pending',
        createdBy: req.user._id,
        reviewedBy: wantsImmediatePublication ? req.user._id : null,
        reviewedAt: wantsImmediatePublication ? now : null,
        publishedBy: wantsImmediatePublication ? req.user._id : null,
        publishedAt: wantsImmediatePublication ? now : null,
      });

      await linkLastPostImageToMediaAsset(lastPost);

      await writeAuditLog({
        req,
        action: 'content.created',
        actor: req.user,
        targetType: 'lastPost',
        target: lastPost._id,
        targetSnapshot: getLastPostSnapshot(lastPost),
        metadata: { status: lastPost.status },
      });

      if (lastPost.status === 'published') {
        await writeAuditLog({
          req,
          action: 'content.published',
          actor: req.user,
          targetType: 'lastPost',
          target: lastPost._id,
          targetSnapshot: getLastPostSnapshot(lastPost),
          metadata: { source: 'create' },
        });
      }

      return res.status(201).json({
        lastPost: {
          _id: lastPost._id,
          status: lastPost.status,
        },
        message:
          lastPost.status === 'published'
            ? 'Last Post notice published successfully'
            : 'Last Post notice submitted for review',
      });
    } catch (error) {
      console.error('Could not submit Last Post notice:', error);
      return res
        .status(500)
        .json({ error: 'Could not submit Last Post notice' });
    }
  },
);

router.get(
  '/mine',
  authMiddleware,
  requirePermission('canCreateDrafts'),
  async (req, res) => {
    try {
      const lastPosts = await LastPostMessage.find({
        createdBy: req.user._id,
        status: { $ne: 'hidden' },
      })
        .select(
          [
            'deceased',
            'messages',
            'messageLanguage',
            'imageUrl',
            'imageDisplayUrl',
            'status',
            'rejectionReason',
            'createdAt',
            'updatedAt',
          ].join(' '),
        )
        .sort({ updatedAt: -1 })
        .lean();

      return res.json({ lastPosts });
    } catch (error) {
      console.error('Could not load user Last Post notices:', error);
      return res.status(500).json({
        error: 'Could not load your Last Post notices',
      });
    }
  },
);

router.get(
  '/review',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const lastPosts = await LastPostMessage.find({ status: 'pending' })
        .populate(
          'publicationPermission.confirmedBy',
          'username accountName email role',
        )
        .sort({ createdAt: 1, _id: 1 })
        .lean();

      return res.json({ lastPosts });
    } catch (error) {
      console.error('Could not load Last Post review queue:', error);
      return res
        .status(500)
        .json({ error: 'Could not load Last Post review queue' });
    }
  },
);

router.patch(
  '/:messageId/review-content',
  authMiddleware,
  async (req, res) => {
    try {
      const { messageId } = req.params;
      const { language, message } = req.body;

      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        return res.status(404).json({ error: 'Last Post notice not found' });
      }

      if (!['en', 'fr'].includes(language)) {
        return res.status(400).json({
          error: 'Review content language must be English or French',
        });
      }

      if (typeof message !== 'string') {
        return res.status(400).json({
          error: 'Last Post review message text is required',
        });
      }

      const lastPost = await LastPostMessage.findById(messageId);

      if (!lastPost) {
        return res
          .status(404)
          .json({ error: 'Last Post notice not found' });
      }

      const permissions = getUserPermissions(req.user);
      const canReview = permissions.canReviewAndPublish === true;
      const isOwner =
        lastPost.createdBy && String(lastPost.createdBy) === String(req.user._id);
      const canSubmitterEdit =
        isOwner && ['pending', 'rejected'].includes(lastPost.status);
      const canReviewerEdit =
        canReview && ['pending', 'published'].includes(lastPost.status);
      const wasRejected = isOwner && lastPost.status === 'rejected';

      if (!canReview && !isOwner) {
        return res.status(403).json({
          error: 'You do not have permission to update this Last Post notice',
        });
      }

      if (!canSubmitterEdit && !canReviewerEdit) {
        return res.status(409).json({
          error: 'Only pending or published Last Post notices can have content updated',
        });
      }

      const before = { message: lastPost.messages?.[language] || '' };

      lastPost.set(`messages.${language}`, cleanString(message));
      lastPost.markModified('messages');
      lastPost.updatedBy = req.user._id;

      if (wasRejected) {
        lastPost.status = 'pending';
        lastPost.rejectionReason = '';
        lastPost.reviewedBy = null;
        lastPost.reviewedAt = null;
        lastPost.publishedBy = null;
        lastPost.publishedAt = null;
      }
      await lastPost.save();

      await recordContentRevision({
        contentType: 'lastPost',
        content: lastPost,
        actor: req.user,
        status: lastPost.status,
        language,
        fields: ['message'],
        before,
        after: { message: lastPost.messages?.[language] || '' },
        note: req.body.note,
      });

      await writeAuditLog({
        req,
        action:
          wasRejected
            ? 'content.review_content_updated'
            : lastPost.status === 'pending'
            ? 'content.review_content_updated'
            : 'content.staff_content_updated',
        actor: req.user,
        targetType: 'lastPost',
        target: lastPost._id,
        targetSnapshot: getLastPostSnapshot(lastPost),
        metadata: {
          source: wasRejected ? 'submitter-resubmit' : 'review-content',
          status: lastPost.status,
          language,
          fields: ['message'],
        },
      });

      return res.json({
        message:
          wasRejected
            ? 'Last Post content updated and submitted for review'
            : lastPost.status === 'published'
            ? 'Published Last Post content updated'
            : 'Last Post review content updated',
        lastPost,
      });
    } catch (error) {
      console.error('Could not update Last Post review content:', error);

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'The Last Post notice must be 10000 characters or fewer',
        });
      }

      return res
        .status(500)
        .json({ error: 'Could not update Last Post review content' });
    }
  },
);

router.patch(
  '/:messageId/review',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const { messageId } = req.params;
      const action = cleanString(req.body?.action);
      const rejectionReason = cleanString(req.body?.rejectionReason);

      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        return res.status(404).json({ error: 'Last Post notice not found' });
      }

      if (!['publish', 'reject'].includes(action)) {
        return res.status(400).json({
          error: 'Review action must be publish or reject',
        });
      }

      const lastPost = await LastPostMessage.findOne({
        _id: messageId,
        status: 'pending',
      });

      if (!lastPost) {
        return res
          .status(404)
          .json({ error: 'Pending Last Post notice not found' });
      }

      if (action === 'reject') {
        if (!rejectionReason) {
          return res
            .status(400)
            .json({ error: 'A rejection reason is required' });
        }

        lastPost.status = 'rejected';
        lastPost.rejectionReason = rejectionReason;
        await lastPost.save();

        return res.json({ lastPost });
      }

      const storedMessages = getLocalizedMessages(lastPost);
      const messages = {
        en:
          cleanString(req.body?.messages?.en) || cleanString(storedMessages.en),
        fr:
          cleanString(req.body?.messages?.fr) || cleanString(storedMessages.fr),
      };

      if (!messages.en || !messages.fr) {
        return res.status(400).json({
          error: 'English and French notices are required before publication',
        });
      }

      lastPost.messages = messages;
      lastPost.status = 'published';
      lastPost.publishedAt = new Date();
      lastPost.rejectionReason = '';
      await lastPost.save();

      return res.json({ lastPost });
    } catch (error) {
      console.error('Could not review Last Post notice:', error);
      return res
        .status(500)
        .json({ error: 'Could not review Last Post notice' });
    }
  },
);

router.get('/', async (req, res) => {
  try {
    const cursor = decodeCursor(req.query.cursor);

    if (cursor === undefined) {
      return res
        .status(400)
        .json({ error: 'The pagination cursor is invalid' });
    }

    const pageSize = getPageSize(req.query.limit);
    const lastPosts = await LastPostMessage.find({
      status: 'published',
      ...getCursorFilter(cursor),
    })
      .sort({ publishedAt: -1, _id: -1 })
      .limit(pageSize + 1)
      .lean();
    const hasMore = lastPosts.length > pageSize;
    const visibleLastPosts = hasMore ? lastPosts.slice(0, pageSize) : lastPosts;

    return res.json({
      lastPosts: visibleLastPosts.map(serializeLastPost),
      hasMore,
      nextCursor: hasMore
        ? encodeCursor(visibleLastPosts[visibleLastPosts.length - 1])
        : '',
    });
  } catch (error) {
    console.error('Could not load Last Post notices:', error);
    return res.status(500).json({ error: 'Could not load Last Post notices' });
  }
});

router.get('/:messageId/edit', authMiddleware, async (req, res) => {
  try {
    const lastPost = await LastPostMessage.findById(req.params.messageId).lean();

    if (!lastPost) {
      return res.status(404).json({ error: 'Last Post notice not found' });
    }

    const permissions = getUserPermissions(req.user);
    const isOwner =
      lastPost.createdBy && String(lastPost.createdBy) === String(req.user._id);
    const canReview = permissions.canReviewAndPublish === true;

    if (!isOwner && !canReview) {
      return res.status(403).json({
        error: 'You do not have permission to edit this Last Post notice',
      });
    }

    if (isOwner && !canReview && lastPost.status === 'hidden') {
      return res.status(404).json({ error: 'Last Post notice not found' });
    }

    return res.json({ lastPost });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Last Post notice not found' });
    }

    console.error('Could not load Last Post notice for editing:', error);
    return res.status(500).json({
      error: 'Could not load Last Post notice for editing',
    });
  }
});

router.patch('/:messageId', authMiddleware, async (req, res) => {
  try {
    const lastPost = await LastPostMessage.findById(req.params.messageId);

    if (!lastPost) {
      return res.status(404).json({ error: 'Last Post notice not found' });
    }

    const permissions = getUserPermissions(req.user);
    const isOwner =
      lastPost.createdBy && String(lastPost.createdBy) === String(req.user._id);
    const canReview = permissions.canReviewAndPublish === true;
    const previousStatus = lastPost.status;

    if (!isOwner && !canReview) {
      return res.status(403).json({
        error: 'You do not have permission to edit this Last Post notice',
      });
    }

    if (lastPost.status === 'hidden') {
      if (isOwner && !canReview) {
        return res.status(404).json({ error: 'Last Post notice not found' });
      }

      return res.status(409).json({
        error: 'Restore this Last Post notice before editing or publishing it',
      });
    }

    if (isOwner && !canReview && lastPost.status === 'published') {
      return res.status(409).json({
        error: 'Published Last Post notices can only be changed by site staff',
      });
    }

    const deceased = req.body?.deceased || {};
    const messageLanguage = cleanString(req.body?.messageLanguage);
    const message = cleanString(req.body?.message);
    const imageUrl = cleanString(req.body?.imageUrl);
    const imageDisplayUrl = cleanString(req.body?.imageDisplayUrl);
    const hasTitle = Object.prototype.hasOwnProperty.call(req.body || {}, 'title');
    const hasSlug = Object.prototype.hasOwnProperty.call(req.body || {}, 'slug');
    const hasPhotoUrl = Object.prototype.hasOwnProperty.call(
      req.body || {},
      'photoUrl',
    );
    const publicationPermissionConfirmed = parseBoolean(
      req.body?.publicationPermissionConfirmed,
      false,
    );
    const wantsImmediatePublication = parseBoolean(req.body?.publishNow, false);
    const cleanDeceased = {
      fullRank: cleanString(deceased.fullRank),
      firstName: cleanString(deceased.firstName),
      surname: cleanString(deceased.surname),
      postNominal: cleanString(deceased.postNominal),
    };

    if (
      !cleanDeceased.fullRank ||
      !cleanDeceased.firstName ||
      !cleanDeceased.surname
    ) {
      return res.status(400).json({
        error:
          'Full rank, first name, and surname are required for the deceased member',
      });
    }

    if (!['en', 'fr'].includes(messageLanguage)) {
      return res.status(400).json({
        error: 'Choose whether the notice was submitted in English or French',
      });
    }

    if (!message) {
      return res.status(400).json({ error: 'A Last Post notice is required' });
    }

    if (!publicationPermissionConfirmed) {
      return res.status(400).json({
        error: 'Chain-of-command permission confirmation is required',
      });
    }

    if (message.length > 10000) {
      return res.status(400).json({
        error: 'The Last Post notice must be 10000 characters or fewer',
      });
    }

    if (!isValidImageUrl(imageUrl) || !isValidImageUrl(imageDisplayUrl)) {
      return res.status(400).json({
        error: 'The image URL must begin with http:// or https://',
      });
    }

    if (wantsImmediatePublication && !canReview) {
      return res.status(403).json({
        error: 'You do not have permission to publish Last Post notices immediately',
      });
    }

    const now = new Date();
    const messages = getLocalizedMessages(lastPost);
    messages[messageLanguage] = message;

    lastPost.deceased = cleanDeceased;
    lastPost.messageLanguage = messageLanguage;
    lastPost.messages = messages;
    lastPost.imageUrl = imageUrl;
    lastPost.imageDisplayUrl = imageDisplayUrl;
    if (hasTitle) lastPost.title = cleanString(req.body.title);
    if (hasSlug) lastPost.slug = cleanString(req.body.slug);
    if (hasPhotoUrl) lastPost.photoUrl = cleanString(req.body.photoUrl);
    lastPost.publicationPermission = {
      confirmed: true,
      confirmedAt: now,
      confirmedBy: req.user._id,
    };
    lastPost.updatedBy = req.user._id;
    lastPost.status = wantsImmediatePublication ? 'published' : 'pending';
    lastPost.rejectionReason = '';
    lastPost.reviewedBy = wantsImmediatePublication ? req.user._id : null;
    lastPost.reviewedAt = wantsImmediatePublication ? now : null;
    lastPost.publishedBy = wantsImmediatePublication ? req.user._id : null;
    lastPost.publishedAt = wantsImmediatePublication ? now : null;

    await lastPost.save();
    await linkLastPostImageToMediaAsset(lastPost);

    await writeAuditLog({
      req,
      action: 'content.created',
      actor: req.user,
      targetType: 'lastPost',
      target: lastPost._id,
      targetSnapshot: getLastPostSnapshot(lastPost),
      metadata: {
        source: 'resubmit',
        status: lastPost.status,
      },
    });

    if (lastPost.status === 'published' && previousStatus !== 'published') {
      await writeAuditLog({
        req,
        action: 'content.published',
        actor: req.user,
        targetType: 'lastPost',
        target: lastPost._id,
        targetSnapshot: getLastPostSnapshot(lastPost),
        metadata: { source: 'update' },
      });
    }

    return res.json({
      message:
        lastPost.status === 'published'
          ? 'Last Post notice updated and published'
          : 'Last Post notice updated and submitted for review',
      lastPost,
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Last Post notice not found' });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'The Last Post notice contains invalid values',
      });
    }

    console.error('Could not update Last Post notice:', error);
    return res.status(500).json({ error: 'Could not update Last Post notice' });
  }
});

router.get('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(404).json({ error: 'Last Post notice not found' });
    }

    const lastPost = await LastPostMessage.findOne({
      _id: messageId,
      status: 'published',
    }).lean();

    if (!lastPost) {
      return res.status(404).json({ error: 'Last Post notice not found' });
    }

    return res.json({ lastPost: serializeLastPost(lastPost) });
  } catch (error) {
    console.error('Could not load Last Post notice:', error);
    return res.status(500).json({ error: 'Could not load Last Post notice' });
  }
});

module.exports = router;
