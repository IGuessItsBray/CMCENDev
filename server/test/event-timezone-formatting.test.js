const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const publicPath = path.join(__dirname, '..', 'public');
const homeScript = fs.readFileSync(path.join(publicPath, 'home.js'), 'utf8');
const calendarScript = fs.readFileSync(
  path.join(publicPath, 'calendar.js'),
  'utf8',
);

test('uses each timed event timezone in public list formatting', () => {
  assert.match(
    homeScript,
    /function getHomeEventTimeZoneOptions\(event\)[\s\S]*event\.timezone/u,
  );
  assert.match(
    homeScript,
    /function formatHomeEventTime[\s\S]*getHomeEventTimeZoneOptions\(event\)/u,
  );

  assert.match(
    calendarScript,
    /function getEventTimeZoneOptions\(event\)[\s\S]*event\.timezone/u,
  );
  assert.match(
    calendarScript,
    /function formatEventTime[\s\S]*getEventTimeZoneOptions\(event\)/u,
  );
  assert.match(
    calendarScript,
    /function getEventChipTime[\s\S]*getEventTimeZoneOptions\(event\)/u,
  );
});
