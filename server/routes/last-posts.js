const express = require('express');
const mongoose = require('mongoose');
const LastPostMessage = require('../models/LastPostMessage');

const router = express.Router();
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getPageSize(value) {
  const requested = Number.parseInt(value, 10);

  if (!Number.isInteger(requested) || requested < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(requested, MAX_PAGE_SIZE);
}

function encodeCursor(lastPost) {
  return Buffer.from(JSON.stringify({
    id: String(lastPost._id),
    publishedAt: lastPost.publishedAt
      ? new Date(lastPost.publishedAt).toISOString()
      : null
  })).toString('base64url');
}

function decodeCursor(value) {
  const cursor = cleanString(value);

  if (!cursor) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
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
      publishedAt
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
      _id: { $lt: cursor.id }
    };
  }

  return {
    $or: [
      { publishedAt: { $lt: cursor.publishedAt } },
      { publishedAt: cursor.publishedAt, _id: { $lt: cursor.id } },
      { publishedAt: null }
    ]
  };
}

function getDeceasedName(lastPost) {
  const deceased = lastPost.deceased || {};
  const name = [
    cleanString(deceased.fullRank),
    cleanString(deceased.firstName),
    cleanString(deceased.surname)
  ].filter(Boolean).join(' ');
  const postNominal = cleanString(deceased.postNominal);

  return [name, postNominal].filter(Boolean).join(', ') ||
    cleanString(lastPost.title) ||
    'In Memoriam';
}

function serializeLastPost(lastPost) {
  const deceased = lastPost.deceased?.toObject?.() ||
    lastPost.deceased || {};

  return {
    _id: lastPost._id,
    deceased: {
      fullRank: cleanString(deceased.fullRank),
      firstName: cleanString(deceased.firstName),
      surname: cleanString(deceased.surname),
      postNominal: cleanString(deceased.postNominal)
    },
    displayName: getDeceasedName(lastPost),
    message: cleanString(lastPost.message),
    messageLanguage: ['en', 'fr'].includes(lastPost.messageLanguage)
      ? lastPost.messageLanguage
      : 'en',
    imageUrl: cleanString(lastPost.imageUrl) ||
      cleanString(lastPost.photoUrl),
    publishedAt: lastPost.publishedAt || null
  };
}

router.get('/', async (req, res) => {
  try {
    const cursor = decodeCursor(req.query.cursor);

    if (cursor === undefined) {
      return res.status(400).json({ error: 'The pagination cursor is invalid' });
    }

    const pageSize = getPageSize(req.query.limit);
    const lastPosts = await LastPostMessage.find({
      status: 'published',
      ...getCursorFilter(cursor)
    })
      .sort({ publishedAt: -1, _id: -1 })
      .limit(pageSize + 1)
      .lean();
    const hasMore = lastPosts.length > pageSize;
    const visibleLastPosts = hasMore
      ? lastPosts.slice(0, pageSize)
      : lastPosts;

    return res.json({
      lastPosts: visibleLastPosts.map(serializeLastPost),
      hasMore,
      nextCursor: hasMore
        ? encodeCursor(visibleLastPosts[visibleLastPosts.length - 1])
        : ''
    });
  } catch (error) {
    console.error('Could not load Last Post notices:', error);
    return res.status(500).json({ error: 'Could not load Last Post notices' });
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
      status: 'published'
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
