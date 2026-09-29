const express = require('express');
const Comment = require('../models/Comment');
const { getCommentTarget } = require('../config/comment-targets');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { getUserPermissions } = require('../config/permissions');
const { writeAuditLog } = require('../services/audit-log');
const { getCommentSnapshot } = require('../services/content-snapshots');
const { markContentEdited } = require('../services/content-edit-metadata');
const {
  cleanString,
  getValidationErrorMessage,
} = require('../services/content-utils');
const router = express.Router();

router.get(
  '/review',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const allowedStatuses = ['draft', 'pending', 'rejected', 'published'];

      const requestedStatus =
        typeof req.query.status === 'string' ? req.query.status : 'pending';

      if (!allowedStatuses.includes(requestedStatus)) {
        return res.status(400).json({
          error: 'Invalid review status',
        });
      }

      const comments = await Comment.find({
        status: requestedStatus,
      })
        .populate(
          'author',
          'username accountName firstName lastName email role',
        )
        .populate('reviewedBy', 'username accountName email role')
        .populate('parentId')
        .sort({
          createdAt: 1,
        })
        .lean();

      res.json({
        status: requestedStatus,
        comments,
      });
    } catch (error) {
      console.error('Could not load comment review queue:', error);

      res.status(500).json({
        error: 'Could not load comment review queue',
      });
    }
  },
);

router.patch(
  '/:commentId/review',
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

      if (req.body?.scheduledPublishAt !== undefined) {
        return res.status(400).json({
          error: 'Scheduled publication is not supported for comments',
        });
      }

      const comment = await Comment.findById(req.params.commentId);

      if (!comment) {
        return res.status(404).json({
          error: 'Comment not found',
        });
      }

      if (comment.status === 'draft' && action === 'reject') {
        return res.status(409).json({
          error: 'Drafts are not submissions awaiting approval',
        });
      }
      if (!['draft', 'pending'].includes(comment.status)) {
        return res.status(409).json({
          error: 'Only draft or pending comments can be reviewed',
        });
      }

      const reviewDate = new Date();

      if (action === 'reject') {
        const cleanReason = cleanString(rejectionReason);

        if (!cleanReason || cleanReason.length > 2000) {
          return res.status(400).json({
            error: 'A rejection reason of 1–2000 characters is required',
          });
        }

        comment.status = 'rejected';
        comment.rejectionReason = cleanReason;
        comment.publishedBy = null;
        comment.publishedAt = null;
      }

      if (action === 'publish') {
        comment.rejectionReason = '';
        comment.status = 'published';
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
          targetType: 'comment',
          target: comment._id,
          targetSnapshot: getCommentSnapshot(comment),
          metadata: { source: 'review' },
        });
      }

      if (action === 'reject') {
        await writeAuditLog({
          req,
          action: 'content.rejected',
          actor: req.user,
          targetType: 'comment',
          target: comment._id,
          targetSnapshot: getCommentSnapshot(comment),
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

      await comment.populate('parentId');

      res.json({
        message:
          action === 'publish'
            ? 'Comment published successfully'
            : 'Comment rejected',

        comment,
      });
    } catch (error) {
      console.error('Could not review comment:', error);

      if (error.name === 'CastError') {
        return res.status(400).json({
          error: 'Invalid comment ID',
        });
      }

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: getValidationErrorMessage(error),
        });
      }

      res.status(500).json({
        error: 'Could not review comment',
      });
    }
  },
);

router.get('/:commentId/edit', authMiddleware, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId).lean();

    if (!comment) {
      return res.status(404).json({
        error: 'Comment not found',
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
        error: 'Comment not found',
      });
    }

    console.error('Could not load comment for editing:', error);

    res.status(500).json({
      error: 'Could not load comment for editing',
    });
  }
});

router.patch('/:commentId', authMiddleware, async (req, res) => {
  try {
    if (
      req.body?.submitForReview !== undefined &&
      typeof req.body.submitForReview !== 'boolean'
    ) {
      return res
        .status(400)
        .json({ error: 'submitForReview must be a boolean' });
    }
    const submitForReview = req.body?.submitForReview === true;
    const cleanBody = cleanString(req.body?.body);

    if (cleanBody.length < 2) {
      return res.status(400).json({
        error: 'Comment must contain at least 2 characters',
      });
    }

    if (cleanBody.length > 10000) {
      return res.status(400).json({
        error: 'Comment must be 10000 characters or fewer',
      });
    }

    const comment = await Comment.findById(req.params.commentId);

    if (!comment) {
      return res.status(404).json({
        error: 'Comment not found',
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

    if (comment.status === 'draft') {
      return res.status(409).json({
        error: 'Edit drafts through the staff content workspace',
      });
    }
    if (comment.status === 'hidden') {
      return res.status(409).json({
        error: 'Restore this comment before editing or publishing it',
      });
    }

    if (submitForReview && !isOwner) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (submitForReview && !['pending', 'rejected'].includes(comment.status)) {
      return res
        .status(409)
        .json({ error: 'This comment cannot be resubmitted' });
    }
    markContentEdited(comment, req.user);
    comment.body = cleanBody;
    comment.status =
      !submitForReview && canReview && permissions.canPublishOwnContent === true
        ? 'published'
        : 'pending';
    comment.rejectionReason = '';
    comment.reviewedBy = comment.status === 'published' ? req.user._id : null;
    comment.reviewedAt = comment.status === 'published' ? new Date() : null;
    comment.publishedBy =
      comment.status === 'published'
        ? comment.publishedBy || req.user._id
        : null;
    comment.publishedAt =
      comment.status === 'published' ? comment.publishedAt || new Date() : null;

    await comment.save();
    await writeAuditLog({
      req,
      action: 'content.created',
      actor: req.user,
      targetType: 'comment',
      target: comment._id,
      targetSnapshot: getCommentSnapshot(comment),
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
        error: 'Comment not found',
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: getValidationErrorMessage(error),
      });
    }

    console.error('Could not update comment:', error);

    res.status(500).json({
      error: 'Could not update comment',
    });
  }
});

router.get('/on/:parentType/:parentId', async (req, res) => {
  try {
    const target = getCommentTarget(req.params.parentType);
    if (!target)
      return res.status(400).json({ error: 'Unsupported comment parent type' });
    const Parent = require('../models/' + target.model);
    const parent = await Parent.findOne({
      _id: req.params.parentId,
      status: 'published',
    })
      .select({ _id: 1 })
      .lean();

    if (!parent) {
      return res.status(404).json({
        error: 'Comment parent not found',
      });
    }

    const comments = await Comment.find({
      parentType: req.params.parentType,
      parentId: req.params.parentId,
      status: 'published',
    })
      .select(
        'parentType parentId author body legacy.authorName createdAt publishedAt status',
      )
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
    console.error('Could not load comments:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid comment parent ID',
      });
    }

    res.status(500).json({
      error: 'Could not load comments',
    });
  }
});

router.post('/on/:parentType/:parentId', authMiddleware, async (req, res) => {
  try {
    const cleanBody = cleanString(req.body?.body);

    if (cleanBody.length < 2) {
      return res.status(400).json({
        error: 'Comment must contain at least 2 characters',
      });
    }

    if (cleanBody.length > 10000) {
      return res.status(400).json({
        error: 'Comment must be 10000 characters or fewer',
      });
    }

    const target = getCommentTarget(req.params.parentType);
    if (!target)
      return res.status(400).json({ error: 'Unsupported comment parent type' });
    const Parent = require('../models/' + target.model);
    const parent = await Parent.findOne({
      _id: req.params.parentId,
      status: 'published',
    })
      .select({ _id: 1 })
      .lean();

    if (!parent) {
      return res.status(404).json({
        error: 'Comment parent not found',
      });
    }

    const permissions = getUserPermissions(req.user);

    const publishImmediately = permissions.canPublishOwnContent === true;

    const now = new Date();

    const comment = new Comment({
      parentType: req.params.parentType,
      parentId: parent._id,

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
      targetType: 'comment',
      target: comment._id,
      targetSnapshot: getCommentSnapshot(comment),
      metadata: { status: comment.status },
    });

    if (comment.status === 'published') {
      await writeAuditLog({
        req,
        action: 'content.published',
        actor: req.user,
        targetType: 'comment',
        target: comment._id,
        targetSnapshot: getCommentSnapshot(comment),
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
    console.error('Could not submit comment:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid comment parent ID',
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: getValidationErrorMessage(error),
      });
    }

    res.status(500).json({
      error: 'Could not submit comment',
    });
  }
});

module.exports = router;
