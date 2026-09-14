const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const publicPath = path.join(__dirname, '..', 'public');
const calendarHtml = fs.readFileSync(
  path.join(publicPath, 'calendar.html'),
  'utf8',
);
const sharedStyles = fs.readFileSync(
  path.join(publicPath, 'styles.css'),
  'utf8',
);
const calendarStyles = fs.readFileSync(
  path.join(publicPath, 'calendar.css'),
  'utf8',
);

test('loads calendar-only styles separately from the shared stylesheet', () => {
  assert.match(
    calendarHtml,
    /<link rel="stylesheet" href="\/styles\.css" \/>\s+<link rel="stylesheet" href="\/calendar\.css" \/>/u,
  );
  assert.match(calendarStyles, /\.calendar-main \{/u);
  assert.match(
    calendarStyles,
    /html\[data-theme='dark'\] \.calendar-controls/u,
  );
  assert.doesNotMatch(sharedStyles, /Public events calendar/u);
});
