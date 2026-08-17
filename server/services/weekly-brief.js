const crypto = require('crypto');
const EmailUnsubscribeToken = require('../models/EmailUnsubscribeToken');
const LastPostMessage = require('../models/LastPostMessage');
const Page = require('../models/Page');
const RetirementMessage = require('../models/RetirementMessage');
const User = require('../models/User');
const WeeklyBriefDelivery = require('../models/WeeklyBriefDelivery');
const WeeklyBriefRun = require('../models/WeeklyBriefRun');
const { writeAuditLog } = require('./audit-log');
const { sendMail } = require('./mailer');

const EASTERN_TIME_ZONE = 'America/Toronto';
const CASL_CONSENT_TEXT_VERSION = 'weekly-brief-v1-2026-08-17';
// One extra day ensures the link remains available for at least 60 full days
// after SMTP accepts the message, even when delivery is delayed.
const UNSUBSCRIBE_TOKEN_LIFETIME_MS = 61 * 24 * 60 * 60 * 1000;
const RUN_LOCK_LIFETIME_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function getEasternParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

function getWeekKey(date = new Date()) {
  const parts = getEasternParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isFridayNoonEastern(date = new Date()) {
  const parts = getEasternParts(date);
  return parts.weekday === 'Fri' && parts.hour === '12';
}

function getCaslSenderInfo(environment = process.env) {
  const name = String(environment.CASL_SENDER_NAME || '').trim();
  const mailingAddress = String(
    environment.CASL_SENDER_MAILING_ADDRESS || '',
  ).trim();
  const contact = String(environment.CASL_SENDER_CONTACT || '').trim();

  return {
    name,
    mailingAddress,
    contact,
    ready: Boolean(name && mailingAddress && contact),
  };
}

function getSubscription(user, key, environment = process.env) {
  const subscription = user?.emailSubscriptions?.[key] || {};
  const sender = getCaslSenderInfo(environment);

  return {
    subscribed: subscription.subscribed === true,
    consentedAt: subscription.consentedAt || null,
    unsubscribedAt: subscription.unsubscribedAt || null,
    available: sender.ready,
    sender: sender.ready
      ? {
          name: sender.name,
          mailingAddress: sender.mailingAddress,
          contact: sender.contact,
        }
      : null,
  };
}

function getWeeklyBriefSubscription(user, environment = process.env) {
  return getSubscription(user, 'weeklyBrief', environment);
}

function getNewsAnnouncementsSubscription(user, environment = process.env) {
  return getSubscription(user, 'newsAnnouncements', environment);
}

function localizedValue(value, language) {
  if (typeof value === 'string') return value;
  return value?.[language] || value?.en || value?.fr || '';
}

function getLastPostName(lastPost) {
  return [
    lastPost.deceased?.fullRank,
    lastPost.deceased?.firstName,
    lastPost.deceased?.surname,
    lastPost.deceased?.postNominal,
  ]
    .filter(Boolean)
    .join(' ');
}

function getRetirementName(retirement) {
  return [
    retirement.retiree?.rank,
    retirement.retiree?.firstName,
    retirement.retiree?.lastName,
    retirement.retiree?.postNominals,
  ]
    .filter(Boolean)
    .join(' ');
}

function buildList(items, emptyText) {
  if (!items.length) return `<p>${escapeHtml(emptyText)}</p>`;

  return `<ul>${items
    .map(
      (item) =>
        `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></li>`,
    )
    .join('')}</ul>`;
}

function renderWeeklyBriefEmail({
  content,
  language = 'en',
  baseUrl,
  unsubscribeUrl,
  sender,
}) {
  const isFrench = language === 'fr';
  const labels = isFrench
    ? {
        title: 'Résumé hebdomadaire CMCEN / RCMCE',
        intro: 'Voici les publications de la dernière semaine.',
        lastPosts: 'Derniers hommages',
        retirements: 'Retraites',
        news: 'Nouvelles',
        none: 'Aucune nouvelle publication cette semaine.',
        unsubscribe: 'Se désabonner de ce résumé hebdomadaire',
        account: 'Gérer vos préférences dans votre compte',
      }
    : {
        title: 'CMCEN / RCMCE weekly brief',
        intro: 'Here are the publications from the past week.',
        lastPosts: 'Last Post notices',
        retirements: 'Retirements',
        news: 'News',
        none: 'No new publications this week.',
        unsubscribe: 'Unsubscribe from this weekly brief',
        account: 'Manage your preferences in your account',
      };

  const links = {
    lastPosts: content.lastPosts.map((item) => ({
      title: getLastPostName(item),
      url: `${baseUrl}/last-post-message?id=${encodeURIComponent(String(item._id))}`,
    })),
    retirements: content.retirements.map((item) => ({
      title: getRetirementName(item),
      url: `${baseUrl}/retirement-message?id=${encodeURIComponent(String(item._id))}`,
    })),
    news: content.news.map((item) => ({
      title: localizedValue(item.title, language),
      url: `${baseUrl}/page?slug=${encodeURIComponent(item.slug)}`,
    })),
  };

  const text = [
    labels.title,
    labels.intro,
    `${labels.lastPosts}: ${links.lastPosts.map((item) => item.title).join(', ') || labels.none}`,
    `${labels.retirements}: ${links.retirements.map((item) => item.title).join(', ') || labels.none}`,
    `${labels.news}: ${links.news.map((item) => item.title).join(', ') || labels.none}`,
    `${sender.name} — ${sender.mailingAddress} — ${sender.contact}`,
    `${labels.unsubscribe}: ${unsubscribeUrl}`,
    `${labels.account}: ${baseUrl}/dashboard`,
  ].join('\n\n');

  return {
    text,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><h1>${escapeHtml(labels.title)}</h1><p>${escapeHtml(labels.intro)}</p><h2>${escapeHtml(labels.lastPosts)}</h2>${buildList(links.lastPosts, labels.none)}<h2>${escapeHtml(labels.retirements)}</h2>${buildList(links.retirements, labels.none)}<h2>${escapeHtml(labels.news)}</h2>${buildList(links.news, labels.none)}<hr><p><strong>${escapeHtml(sender.name)}</strong><br>${escapeHtml(sender.mailingAddress)}<br><a href="${escapeHtml(sender.contact)}">${escapeHtml(sender.contact)}</a></p><p><a href="${escapeHtml(unsubscribeUrl)}">${escapeHtml(labels.unsubscribe)}</a> · <a href="${escapeHtml(`${baseUrl}/dashboard`)}">${escapeHtml(labels.account)}</a></p></body></html>`,
  };
}

async function getWeeklyBriefContent(windowStart, windowEnd) {
  const dateFilter = { $gte: windowStart, $lt: windowEnd };
  const [lastPosts, retirements, news] = await Promise.all([
    LastPostMessage.find({ status: 'published', publishedAt: dateFilter })
      .select('deceased publishedAt')
      .sort({ publishedAt: -1 })
      .lean(),
    RetirementMessage.find({ status: 'published', publishedAt: dateFilter })
      .select('retiree publishedAt')
      .sort({ publishedAt: -1 })
      .lean(),
    Page.find({
      status: 'published',
      'access.audience': 'public',
      publishedAt: dateFilter,
    })
      .select('title slug publishedAt')
      .sort({ publishedAt: -1 })
      .lean(),
  ]);

  return { lastPosts, retirements, news };
}

async function claimWeeklyBriefRun(now) {
  const weekKey = getWeekKey(now);
  const existing = await WeeklyBriefRun.findOne({ weekKey });

  if (existing?.state === 'completed') return null;
  if (
    existing?.state === 'running' &&
    existing.lockExpiresAt.getTime() > now.getTime()
  ) {
    return null;
  }

  const previousCompletedRun = await WeeklyBriefRun.findOne({
    state: 'completed',
  })
    .sort({ windowEnd: -1 })
    .lean();
  const windowStart =
    previousCompletedRun?.windowEnd || new Date(now - WEEK_MS);
  const values = {
    windowStart,
    windowEnd: now,
    state: 'running',
    lockExpiresAt: new Date(now.getTime() + RUN_LOCK_LIFETIME_MS),
    completedAt: null,
    recipientCount: 0,
    sentCount: 0,
    failedCount: 0,
    error: '',
  };

  if (existing) {
    const result = await WeeklyBriefRun.findOneAndUpdate(
      {
        _id: existing._id,
        $or: [
          { state: 'failed' },
          { state: 'running', lockExpiresAt: { $lte: now } },
        ],
      },
      { $set: values },
      { returnDocument: 'after' },
    );
    return result || null;
  }

  try {
    return await WeeklyBriefRun.create({ weekKey, ...values });
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

async function createDelivery(run, user) {
  try {
    return await WeeklyBriefDelivery.create({ run: run._id, user: user._id });
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

async function createUnsubscribeToken(user, subscriptionType = 'weeklyBrief') {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await EmailUnsubscribeToken.create({
    user: user._id,
    subscriptionType,
    tokenHash,
    expiresAt: new Date(Date.now() + UNSUBSCRIBE_TOKEN_LIFETIME_MS),
  });
  return token;
}

async function runWeeklyBrief(now = new Date()) {
  const sender = getCaslSenderInfo();
  const baseUrl = String(process.env.APP_BASE_URL || '').replace(/\/+$/u, '');

  if (!sender.ready || !baseUrl) {
    throw new Error(
      'Weekly brief delivery requires CASL sender name, mailing address, contact, and APP_BASE_URL configuration',
    );
  }

  const run = await claimWeeklyBriefRun(now);
  if (!run) return { skipped: true };

  try {
    const content = await getWeeklyBriefContent(run.windowStart, run.windowEnd);
    const users = await User.find({
      'emailSubscriptions.weeklyBrief.subscribed': true,
      'emailSubscriptions.weeklyBrief.consentedAt': { $ne: null },
      'emailSubscriptions.weeklyBrief.unsubscribedAt': null,
    }).select(
      'email accountName firstName preferredLanguage emailSubscriptions.weeklyBrief',
    );
    let sentCount = 0;
    let failedCount = 0;

    for (const user of users) {
      const delivery = await createDelivery(run, user);
      if (!delivery) continue;

      try {
        const token = await createUnsubscribeToken(user);
        const unsubscribeUrl = `${baseUrl}/api/subscriptions/weekly-brief/unsubscribe?token=${encodeURIComponent(token)}`;
        const email = renderWeeklyBriefEmail({
          content,
          language: user.preferredLanguage,
          baseUrl,
          unsubscribeUrl,
          sender,
        });
        await sendMail({
          to: user.email,
          subject:
            user.preferredLanguage === 'fr'
              ? 'Résumé hebdomadaire CMCEN / RCMCE'
              : 'CMCEN / RCMCE weekly brief',
          ...email,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        delivery.state = 'sent';
        delivery.sentAt = new Date();
        await delivery.save();
        sentCount += 1;
        await writeAuditLog({
          action: 'email.weekly_brief_sent',
          targetType: 'user',
          target: user._id,
          targetSnapshot: { email: user.email, accountName: user.accountName },
          metadata: { run: String(run._id), weekKey: run.weekKey },
        });
      } catch (error) {
        delivery.state = 'failed';
        delivery.error = String(
          error?.message || 'Email delivery failed',
        ).slice(0, 500);
        await delivery.save();
        failedCount += 1;
        console.error('Weekly brief email delivery failed:', error);
      }
    }

    run.state = 'completed';
    run.completedAt = new Date();
    run.recipientCount = users.length;
    run.sentCount = sentCount;
    run.failedCount = failedCount;
    await run.save();
    return { skipped: false, sentCount, failedCount, run };
  } catch (error) {
    run.state = 'failed';
    run.error = String(error?.message || 'Weekly brief run failed').slice(
      0,
      500,
    );
    await run.save();
    throw error;
  }
}

function startWeeklyBriefScheduler() {
  let running = false;
  const tick = async () => {
    if (running || !isFridayNoonEastern()) return;
    running = true;
    try {
      await runWeeklyBrief();
    } catch (error) {
      console.error('Weekly brief scheduler failed:', error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, 60 * 1000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

module.exports = {
  CASL_CONSENT_TEXT_VERSION,
  createUnsubscribeToken,
  getCaslSenderInfo,
  getNewsAnnouncementsSubscription,
  getWeeklyBriefSubscription,
  getWeekKey,
  isFridayNoonEastern,
  renderWeeklyBriefEmail,
  runWeeklyBrief,
  startWeeklyBriefScheduler,
};
