const express = require('express');
const ProfessionalAward = require('../models/ProfessionalAward');
const NewsArticle = require('../models/NewsArticle');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit-log');

const router = express.Router();
const DEFAULT_NEWS_IMAGE_URL =
  'https://cdn.corebot.ca/cmcen-demo/images/crest/large.webp';

function cleanText(value, maxLength = 8000) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function cleanSlug(value) {
  return cleanText(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function cleanUrl(value) {
  const url = cleanText(value, 2000);
  return /^https?:\/\//iu.test(url) ? url : '';
}

function cleanLinks(value) {
  return (Array.isArray(value) ? value : [])
    .map((link) => ({
      label: cleanText(link?.label, 240),
      url: cleanUrl(link?.url),
      kind: ['instruction', 'nomination', 'application', 'other'].includes(
        link?.kind,
      )
        ? link.kind
        : 'other',
    }))
    .filter((link) => link.label && link.url);
}

function cleanRecipients(value) {
  return (Array.isArray(value) ? value : [])
    .map((recipient) => ({
      year: Number.parseInt(recipient?.year, 10),
      medallionNumber: cleanText(recipient?.medallionNumber, 80),
      amount: cleanText(recipient?.amount, 80),
      name: cleanText(recipient?.name, 300),
      role: cleanText(recipient?.role, 240),
      imageUrl: cleanUrl(recipient?.imageUrl),
      featured: recipient?.featured === true,
    }))
    .filter(
      (recipient) =>
        recipient.name && recipient.year >= 1900 && recipient.year <= 3000,
    )
    .sort(
      (left, right) =>
        right.year - left.year || left.name.localeCompare(right.name),
    );
}

function cleanRecipient(value = {}) {
  return cleanRecipients([value])[0] || null;
}

function isSpotlightAward(award) {
  return ['subaltern-of-the-year', 'member-of-the-year'].includes(award.slug);
}

function isMedallionAward(award) {
  return award.slug === 'colonel-in-chief-commendation';
}

function isAmountAward(award) {
  return award.slug === 'branch-bursary';
}

function getLatestRecipient(recipients = []) {
  return (
    [...recipients].sort(
      (left, right) => Number(right.year) - Number(left.year),
    )[0] || null
  );
}

function getRecipientNewsPayload(award, recipient) {
  const name = recipient.name;
  const awardTitle = award.title;
  return {
    title: {
      en: `Congratulations to ${name}`,
      fr: `Félicitations à ${name}`,
    },
    content: {
      en: `The C&E Branch would like to congratulate ${name} on being awarded the ${awardTitle}.`,
      fr: `Le Corps des transmissions et de l’électronique félicite ${name} pour l’attribution du prix « ${awardTitle} ».`,
    },
    imageUrl: recipient.imageUrl || DEFAULT_NEWS_IMAGE_URL,
    imageDisplayUrl: recipient.imageUrl || DEFAULT_NEWS_IMAGE_URL,
    status: 'published',
  };
}

function cleanPayload(body = {}) {
  return {
    slug: cleanSlug(body.slug || body.title),
    title: cleanText(body.title, 240),
    summary: cleanText(body.summary),
    eligibility: cleanText(body.eligibility),
    applicationDetails: cleanText(body.applicationDetails),
    deadline: cleanText(body.deadline, 2000),
    links: cleanLinks(body.links),
    recipients: cleanRecipients(body.recipients),
    sortOrder: Math.max(0, Number.parseInt(body.sortOrder, 10) || 0),
    published: body.published !== false,
  };
}

function serialize(award) {
  const item = award.toObject ? award.toObject() : award;
  return {
    _id: item._id,
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    eligibility: item.eligibility,
    applicationDetails: item.applicationDetails,
    deadline: item.deadline,
    links: item.links || [],
    recipients: item.recipients || [],
    sortOrder: item.sortOrder || 0,
    published: item.published === true,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function validate(payload) {
  if (!payload.title) return 'Award title is required';
  if (!payload.slug) return 'Award slug is required';
  return '';
}

router.get('/professional-awards', async (req, res) => {
  try {
    const awards = await ProfessionalAward.find({ published: true })
      .sort({ sortOrder: 1, title: 1 })
      .lean();
    const serializedAwards = awards.map(serialize);
    const featuredRecipients = Object.fromEntries(
      [
        ['subaltern', 'subaltern-of-the-year'],
        ['member', 'member-of-the-year'],
      ].map(([key, slug]) => {
        const award = serializedAwards.find((item) => item.slug === slug);
        return [key, getLatestRecipient(award?.recipients)];
      }),
    );
    res.json({ awards: serializedAwards, featuredRecipients });
  } catch (error) {
    console.error('Professional awards list failed:', error);
    res.status(500).json({ error: 'Could not load professional awards' });
  }
});

router.get(
  '/admin/professional-awards',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const awards = await ProfessionalAward.find({})
        .sort({ sortOrder: 1, title: 1 })
        .lean();
      res.json({ awards: awards.map(serialize) });
    } catch (error) {
      console.error('Professional awards admin list failed:', error);
      res.status(500).json({ error: 'Could not load professional awards' });
    }
  },
);

router.post(
  '/admin/professional-awards/:awardId/recipients',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const recipient = cleanRecipient(req.body);
      if (!recipient)
        return res
          .status(400)
          .json({ error: 'A valid recipient name and year are required' });
      const award = await ProfessionalAward.findById(req.params.awardId);
      if (!award)
        return res.status(404).json({ error: 'Professional award not found' });
      recipient.featured = false;
      if (!isSpotlightAward(award)) recipient.imageUrl = '';
      if (!isMedallionAward(award)) recipient.medallionNumber = '';
      if (!isAmountAward(award)) recipient.amount = '';
      award.recipients.push(recipient);
      award.updatedBy = req.user._id;
      await award.save();
      const savedRecipient = award.recipients.at(-1);
      const publishedAt = new Date();
      const article = await NewsArticle.create({
        ...getRecipientNewsPayload(award, savedRecipient),
        createdBy: req.user._id,
        publishedBy: req.user._id,
        publishedAt,
      });
      savedRecipient.newsArticleId = article._id;
      await award.save();
      await writeAuditLog({
        req,
        action: 'professional_award.recipient_added',
        actor: req.user,
        targetType: 'professionalAward',
        target: award._id,
        targetSnapshot: { title: award.title },
        metadata: { recipient: savedRecipient.name, year: savedRecipient.year },
      });
      await writeAuditLog({
        req,
        action: 'content.created',
        actor: req.user,
        targetType: 'newsArticle',
        target: article._id,
        targetSnapshot: { title: article.title.en, publishedAt },
        metadata: {
          source: 'professional_award_recipient',
          award: award.title,
          recipient: savedRecipient.name,
        },
      });
      await writeAuditLog({
        req,
        action: 'content.published',
        actor: req.user,
        targetType: 'newsArticle',
        target: article._id,
        targetSnapshot: { title: article.title.en, publishedAt },
        metadata: { source: 'professional_award_recipient' },
      });
      res.status(201).json({
        message: 'Recipient added and congratulatory news story published',
        award: serialize(award),
        newsArticleId: article._id,
      });
    } catch (error) {
      console.error('Professional award recipient create failed:', error);
      res.status(500).json({ error: 'Could not add recipient' });
    }
  },
);

router.patch(
  '/admin/professional-awards/:awardId/recipients/:recipientId',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const updates = cleanRecipient(req.body);
      if (!updates)
        return res
          .status(400)
          .json({ error: 'A valid recipient name and year are required' });
      const award = await ProfessionalAward.findById(req.params.awardId);
      if (!award)
        return res.status(404).json({ error: 'Professional award not found' });
      const recipient = award.recipients.id(req.params.recipientId);
      if (!recipient)
        return res.status(404).json({ error: 'Recipient not found' });
      updates.featured = false;
      if (!isSpotlightAward(award)) updates.imageUrl = '';
      if (!isMedallionAward(award)) updates.medallionNumber = '';
      if (!isAmountAward(award)) updates.amount = '';
      recipient.set(updates);
      award.updatedBy = req.user._id;
      await award.save();
      await writeAuditLog({
        req,
        action: 'professional_award.recipient_updated',
        actor: req.user,
        targetType: 'professionalAward',
        target: award._id,
        targetSnapshot: { title: award.title },
        metadata: {
          recipient: recipient.name,
          year: recipient.year,
          featured: recipient.featured,
        },
      });
      res.json({ message: 'Recipient updated', award: serialize(award) });
    } catch (error) {
      console.error('Professional award recipient update failed:', error);
      res.status(500).json({ error: 'Could not update recipient' });
    }
  },
);

router.post(
  '/admin/professional-awards',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const payload = cleanPayload(req.body);
      const error = validate(payload);
      if (error) return res.status(400).json({ error });
      const award = await ProfessionalAward.create({
        ...payload,
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });
      await writeAuditLog({
        req,
        action: 'professional_award.created',
        actor: req.user,
        targetType: 'professionalAward',
        target: award._id,
        targetSnapshot: { title: award.title, slug: award.slug },
      });
      res.status(201).json({
        message: 'Professional award created',
        award: serialize(award),
      });
    } catch (error) {
      if (error.code === 11000)
        return res
          .status(409)
          .json({ error: 'An award with that slug already exists' });
      console.error('Professional award create failed:', error);
      res.status(500).json({ error: 'Could not create professional award' });
    }
  },
);

router.patch(
  '/admin/professional-awards/:awardId',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const payload = cleanPayload(req.body);
      const error = validate(payload);
      if (error) return res.status(400).json({ error });
      const previous = await ProfessionalAward.findById(req.params.awardId);
      if (!previous)
        return res.status(404).json({ error: 'Professional award not found' });
      const previousTitle = previous.title;
      previous.set({ ...payload, updatedBy: req.user._id });
      await previous.save();
      await writeAuditLog({
        req,
        action: 'professional_award.updated',
        actor: req.user,
        targetType: 'professionalAward',
        target: previous._id,
        targetSnapshot: { title: previous.title, slug: previous.slug },
        metadata: { previousTitle },
      });
      res.json({
        message: 'Professional award saved',
        award: serialize(previous),
      });
    } catch (error) {
      if (error.code === 11000)
        return res
          .status(409)
          .json({ error: 'An award with that slug already exists' });
      console.error('Professional award update failed:', error);
      res.status(500).json({ error: 'Could not save professional award' });
    }
  },
);

router.delete(
  '/admin/professional-awards/:awardId',
  authMiddleware,
  requirePermission('canDeleteContent'),
  async (req, res) => {
    try {
      const award = await ProfessionalAward.findById(req.params.awardId);
      if (!award)
        return res.status(404).json({ error: 'Professional award not found' });
      await award.deleteOne();
      await writeAuditLog({
        req,
        action: 'professional_award.deleted',
        actor: req.user,
        targetType: 'professionalAward',
        target: award._id,
        targetSnapshot: { title: award.title, slug: award.slug },
      });
      res.json({ message: 'Professional award deleted' });
    } catch (error) {
      console.error('Professional award delete failed:', error);
      res.status(500).json({ error: 'Could not delete professional award' });
    }
  },
);

module.exports = router;
