const express = require('express');
const mongoose = require('mongoose');
const { authMiddleware } = require('../middleware/auth');
const { getUserPermissions } = require('../config/permissions');
const Event = require('../models/Event');
const RetirementMessage = require('../models/RetirementMessage');
const LastPostMessage = require('../models/LastPostMessage');
const RetirementComment = require('../models/RetirementComment');

const router = express.Router();
const sources = {
  event: { model: Event, owner: 'createdBy', titleFields: 'title' },
  retirementMessage: {
    model: RetirementMessage,
    owner: 'createdBy',
    titleFields: 'retiree',
  },
  lastPost: {
    model: LastPostMessage,
    owner: 'createdBy',
    titleFields: 'title deceased',
  },
  retirementComment: {
    model: RetirementComment,
    owner: 'author',
    titleFields: '',
  },
};
const storedStatuses = ['draft', 'pending', 'published', 'rejected'];
const statuses = [...storedStatuses, 'scheduled'];
const commonFields = 'status createdAt updatedAt scheduledPublishAt';
const detailFields = {
  event:
    'description location registration city provinceRegion startDate endDate timezone allDay imagePath',
  retirementMessage: 'message messageLanguage messages photoUrl',
  lastPost: 'messages imageUrl',
  retirementComment: 'body retirementMessage',
};
const text = (value) => (typeof value === 'string' ? value : '');
const localized = (value) => ({ en: text(value?.en), fr: text(value?.fr) });
const invalid = () =>
  Object.assign(new Error('Invalid submission filters or cursor'), {
    status: 400,
  });

function readQuery(query) {
  if (
    Object.keys(query).some(
      (key) => !['type', 'status', 'limit', 'cursor'].includes(key),
    )
  )
    throw invalid();
  const type = query.type ?? 'all';
  const status = query.status ?? 'all';
  if (typeof type !== 'string' || typeof status !== 'string') throw invalid();
  if (type !== 'all' && !Object.hasOwn(sources, type)) throw invalid();
  if (status !== 'all' && !statuses.includes(status)) throw invalid();
  const rawLimit = query.limit ?? '12';
  if (typeof rawLimit !== 'string' || !/^\d{1,2}$/.test(rawLimit))
    throw invalid();
  const limit = Number(rawLimit);
  if (limit < 1 || limit > 48) throw invalid();
  let cursor = null;
  if (query.cursor !== undefined) {
    if (
      typeof query.cursor !== 'string' ||
      !query.cursor ||
      query.cursor.length > 512
    )
      throw invalid();
    try {
      cursor = JSON.parse(
        Buffer.from(query.cursor, 'base64url').toString('utf8'),
      );
    } catch {
      throw invalid();
    }
    if (
      !Array.isArray(cursor) ||
      cursor.length !== 4 ||
      ![0, 1].includes(cursor[0]) ||
      typeof cursor[1] !== 'string' ||
      !Number.isFinite(Date.parse(cursor[1])) ||
      new Date(cursor[1]).toISOString() !== cursor[1] ||
      typeof cursor[2] !== 'string' ||
      !/^[a-f0-9]{24}$/.test(cursor[2]) ||
      typeof cursor[3] !== 'string' ||
      !Object.hasOwn(sources, cursor[3])
    )
      throw invalid();
  }
  return { type, status, limit, cursor };
}

function titleFor(type, record) {
  if (type === 'event') return localized(record.title);
  const name =
    type === 'retirementMessage'
      ? [
          record.retiree?.rank,
          record.retiree?.firstName,
          record.retiree?.lastName,
        ]
      : type === 'lastPost'
        ? [
            record.deceased?.fullRank,
            record.deceased?.firstName,
            record.deceased?.surname,
          ]
        : [];
  const title =
    (type === 'lastPost' ? text(record.title) : '') ||
    name.filter(Boolean).join(' ');
  return { en: title, fr: title };
}

function summary(type, record) {
  return {
    id: String(record._id),
    type,
    title: titleFor(type, record),
    status:
      record.status === 'pending' && record.scheduledPublishAt
        ? 'scheduled'
        : record.status,
    submittedAt: record.createdAt || new Date(0),
    updatedAt: record.updatedAt || record.createdAt || new Date(0),
  };
}

function ownerFilter(source, userId, status = 'all') {
  const filter = { [source.owner]: userId, status: { $in: storedStatuses } };
  if (status === 'scheduled')
    Object.assign(filter, {
      status: 'pending',
      scheduledPublishAt: { $ne: null },
    });
  else if (status === 'pending')
    Object.assign(filter, { status: 'pending', scheduledPublishAt: null });
  else if (status !== 'all') filter.status = status;
  return filter;
}

function afterCursor(type, cursor) {
  const [attention, date, id, cursorType] = cursor;
  const submittedAt = new Date(date);
  const objectId = new mongoose.Types.ObjectId(id);
  return {
    $or: [
      { _attention: { $lt: attention } },
      { _attention: attention, _submittedAt: { $lt: submittedAt } },
      {
        _attention: attention,
        _submittedAt: submittedAt,
        _id: { $lt: objectId },
      },
      ...(type > cursorType
        ? [{ _attention: attention, _submittedAt: submittedAt, _id: objectId }]
        : []),
    ],
  };
}

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { type, status, limit, cursor } = readQuery(req.query);
    const types = type === 'all' ? Object.keys(sources) : [type];
    const batches = await Promise.all(
      types.map(async (type) => {
        const source = sources[type];
        const projection = Object.fromEntries(
          `${commonFields} ${source.titleFields} _attention _submittedAt`
            .split(/\s+/)
            .filter(Boolean)
            .map((key) => [key, 1]),
        );
        const records = await source.model.aggregate([
          { $match: ownerFilter(source, req.user._id, status) },
          {
            $addFields: {
              _attention: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
              _submittedAt: { $ifNull: ['$createdAt', new Date(0)] },
            },
          },
          ...(cursor ? [{ $match: afterCursor(type, cursor) }] : []),
          { $sort: { _attention: -1, _submittedAt: -1, _id: -1 } },
          { $limit: limit + 1 },
          { $project: projection },
        ]);
        return records.map((record) => ({ type, record }));
      }),
    );
    const rows = batches
      .flat()
      .sort(
        (a, b) =>
          b.record._attention - a.record._attention ||
          b.record._submittedAt - a.record._submittedAt ||
          String(b.record._id).localeCompare(String(a.record._id)) ||
          a.type.localeCompare(b.type),
      );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const hasMore = rows.length > limit;
    const nextCursor = hasMore
      ? Buffer.from(
          JSON.stringify([
            last.record._attention,
            last.record._submittedAt.toISOString(),
            String(last.record._id),
            last.type,
          ]),
        ).toString('base64url')
      : null;
    res.set('Cache-Control', 'no-store').json({
      items: page.map(({ type, record }) => summary(type, record)),
      hasMore,
      nextCursor,
    });
  } catch (error) {
    if (error.status === 400)
      return res.status(400).json({ error: error.message });
    console.error('Could not load personal submissions:', error);
    res.status(500).json({ error: 'Could not load your submissions' });
  }
});

router.get('/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  if (!Object.hasOwn(sources, type) || !/^[a-fA-F0-9]{24}$/.test(id))
    return res.status(404).json({ error: 'Submission not found' });
  try {
    const source = sources[type];
    const record = await source.model
      .findOne({ ...ownerFilter(source, req.user._id), _id: id })
      .select(
        `${commonFields} ${source.titleFields} ${detailFields[type]} rejectionReason`,
      )
      .lean();
    if (!record) return res.status(404).json({ error: 'Submission not found' });
    const item = summary(type, record);
    const permissions = getUserPermissions(req.user);
    const editable = ['draft', 'pending', 'rejected'].includes(item.status);
    let editUrl = null;
    let publicUrl = null;
    let content;
    if (type === 'event') {
      content = {
        description: localized(record.description),
        location: localized(record.location),
        registration: localized(record.registration),
        city: text(record.city),
        provinceRegion: text(record.provinceRegion),
        startDate: record.startDate || null,
        endDate: record.endDate || null,
        timezone: text(record.timezone),
        allDay: record.allDay === true,
        imageUrl: text(record.imagePath),
      };
      if (editable && permissions.canCreateDrafts === true)
        editUrl = `/submit-event?id=${id}&personal=1`;
      if (item.status === 'published') publicUrl = `/event?id=${id}`;
    } else if (type === 'retirementMessage' || type === 'lastPost') {
      const messages = localized(record.messages);
      if (
        type === 'retirementMessage' &&
        ['en', 'fr'].includes(record.messageLanguage) &&
        !messages[record.messageLanguage]
      )
        messages[record.messageLanguage] = text(record.message);
      content = {
        messages,
        imageUrl: text(
          type === 'retirementMessage' ? record.photoUrl : record.imageUrl,
        ),
        ...(type === 'retirementMessage'
          ? {
              retirementDate: record.retiree?.retirementDate || null,
              tradeRole: text(record.retiree?.tradeRole),
            }
          : {}),
      };
      if (
        editable &&
        permissions[
          type === 'retirementMessage'
            ? 'canSubmitRetirementMessages'
            : 'canCreateDrafts'
        ] === true
      )
        editUrl = `/${type === 'retirementMessage' ? 'submit-retirement' : 'submit-last-post'}?id=${id}&personal=1`;
      if (item.status === 'published')
        publicUrl = `/${type === 'retirementMessage' ? 'retirement-message' : 'last-post-message'}?id=${id}`;
    } else {
      content = { body: text(record.body) };
      const parent = await RetirementMessage.exists({
        _id: record.retirementMessage,
        status: 'published',
      });
      if (parent && editable)
        editUrl = `/retirement-message?id=${record.retirementMessage}&editComment=${id}&personal=1`;
      if (parent && item.status === 'published')
        publicUrl = `/retirement-message?id=${record.retirementMessage}`;
    }
    res.set('Cache-Control', 'no-store').json({
      item: {
        ...item,
        content,
        editUrl,
        publicUrl,
        feedback:
          item.status === 'rejected' ? text(record.rejectionReason) : '',
        scheduledPublishAt:
          item.status === 'scheduled' ? record.scheduledPublishAt : null,
      },
    });
  } catch (error) {
    console.error('Could not load personal submission:', error);
    res.status(500).json({ error: 'Could not load your submission' });
  }
});

module.exports = router;
