const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildPublicEventCalendar,
} = require('../services/event-calendar-export');

test('builds an escaped, folded all-day iCalendar entry using the selected language', () => {
  const calendar = buildPublicEventCalendar(
    {
      _id: '0123456789abcdef01234567',
      title: { en: 'English event', fr: 'Événement, français; spécial' },
      description: {
        en: 'English description',
        fr: 'Une description avec une nouvelle ligne\net une barre oblique \\.',
      },
      registration: { fr: 'https://example.test/register' },
      location: { fr: 'Salle A, édifice principal' },
      city: 'Ottawa',
      startDate: new Date('2040-07-01T12:00:00.000Z'),
      endDate: new Date('2040-07-03T12:00:00.000Z'),
      allDay: true,
      updatedAt: new Date('2040-01-01T00:00:00.000Z'),
    },
    {
      language: 'fr',
      eventUrl: 'https://cmcen.example/event?id=0123456789abcdef01234567',
      uidDomain: 'cmcen.example',
    },
  );

  assert.match(calendar, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/m);
  assert.match(calendar, /UID:0123456789abcdef01234567@cmcen\.example\r\n/);
  assert.match(calendar, /DTSTART;VALUE=DATE:20400701\r\n/);
  assert.match(calendar, /DTEND;VALUE=DATE:20400704\r\n/);
  assert.match(calendar, /SUMMARY:Événement\\, français\\; spécial\r\n/);
  const unfoldedCalendar = calendar.replace(/\r\n /gu, '');
  assert.ok(
    unfoldedCalendar.includes(
      'DESCRIPTION:Une description avec une nouvelle ligne\\net une barre oblique \\\\.\\n\\nhttps://example.test/register\r\n',
    ),
  );
  assert.match(calendar, /LOCATION:Salle A\\, édifice principal\\, Ottawa\r\n/);
  assert.match(
    calendar,
    /URL:https:\/\/cmcen\.example\/event\?id=0123456789abcdef01234567\r\n/,
  );
  assert.match(calendar, /END:VCALENDAR\r\n$/);

  for (const line of calendar.split('\r\n').filter(Boolean)) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  }
});

test('uses UTC timestamps for timed events and omits unavailable optional fields', () => {
  const calendar = buildPublicEventCalendar(
    {
      _id: 'event-id',
      title: { en: 'Timed event' },
      startDate: new Date('2040-07-01T13:30:00.000Z'),
      endDate: new Date('2040-07-01T15:00:00.000Z'),
      allDay: false,
      updatedAt: new Date('2040-01-01T00:00:00.000Z'),
    },
    { uidDomain: 'calendar.example' },
  );

  assert.match(calendar, /DTSTART:20400701T133000Z\r\n/);
  assert.match(calendar, /DTEND:20400701T150000Z\r\n/);
  assert.doesNotMatch(calendar, /(?:DESCRIPTION|LOCATION|URL):/);
  assert.match(calendar, /UID:event-id@calendar\.example\r\n/);
});
