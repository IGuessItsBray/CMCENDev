const { Buffer } = require('node:buffer');

function getLocalizedText(value, language) {
  return String(value?.[language] || value?.en || value?.fr || '').trim();
}

function escapeCalendarText(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replace(/\\/gu, '\\\\')
    .replace(/;/gu, '\\;')
    .replace(/,/gu, '\\,')
    .replace(/\r\n|\r|\n/gu, '\\n');
}

function foldCalendarLine(line) {
  const lines = [];
  let currentLine = '';
  let currentLength = 0;

  for (const character of Array.from(line)) {
    const characterLength = Buffer.byteLength(character, 'utf8');
    const maximumLength = lines.length ? 74 : 75;

    if (currentLength + characterLength > maximumLength && currentLine) {
      lines.push(currentLine);
      currentLine = ` ${character}`;
      currentLength = 1 + characterLength;
      continue;
    }

    currentLine += character;
    currentLength += characterLength;
  }

  lines.push(currentLine);
  return lines.join('\r\n');
}

function formatUtcDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return date
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}/u, '');
}

function formatAllDayDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return date.toISOString().slice(0, 10).replace(/-/gu, '');
}

function nextUtcDay(value) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function getCalendarLocation(event, language) {
  return [getLocalizedText(event.location, language), event.city]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
}

function buildPublicEventCalendar(event, options = {}) {
  const language = options.language === 'fr' ? 'fr' : 'en';
  const eventUrl = String(options.eventUrl || '').trim();
  const timestamp = formatUtcDateTime(
    event.updatedAt || event.publishedAt || new Date(),
  );
  const title = getLocalizedText(event.title, language) || 'CMCEN event';
  const description = getLocalizedText(event.description, language);
  const registration = getLocalizedText(event.registration, language);
  const descriptionText = [description, registration]
    .filter(Boolean)
    .join('\n\n');
  const uidDomain =
    String(options.uidDomain || 'cmcen.ca')
      .replace(/[^a-z0-9.-]/giu, '')
      .toLowerCase() || 'cmcen.ca';
  const eventId = String(event._id || '').replace(/[^a-z0-9-]/giu, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CMCEN//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${eventId || 'event'}@${uidDomain}`,
    `DTSTAMP:${timestamp}`,
  ];

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatAllDayDate(event.startDate)}`);
    lines.push(
      `DTEND;VALUE=DATE:${formatAllDayDate(nextUtcDay(event.endDate || event.startDate))}`,
    );
  } else {
    lines.push(`DTSTART:${formatUtcDateTime(event.startDate)}`);
    lines.push(`DTEND:${formatUtcDateTime(event.endDate)}`);
  }

  lines.push(`SUMMARY:${escapeCalendarText(title)}`);

  if (descriptionText)
    lines.push(`DESCRIPTION:${escapeCalendarText(descriptionText)}`);
  const location = getCalendarLocation(event, language);
  if (location) lines.push(`LOCATION:${escapeCalendarText(location)}`);
  if (eventUrl) lines.push(`URL:${escapeCalendarText(eventUrl)}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(foldCalendarLine).join('\r\n')}\r\n`;
}

module.exports = { buildPublicEventCalendar };
