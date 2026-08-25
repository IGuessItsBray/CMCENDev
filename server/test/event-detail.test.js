const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const eventDetailScript = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'event.js'),
  'utf8',
);

function formatEventDateRange(event) {
  const element = {
    hidden: false,
    textContent: '',
    className: '',
    removeAttribute() {},
  };
  const context = {
    document: {
      addEventListener() {},
      getElementById() {
        return element;
      },
    },
    URLSearchParams,
    CMCENUtils: {
      getCurrentLanguage: () => 'en',
      getCurrentLocale: () => 'en-CA',
    },
    window: { location: { search: '' } },
    translate: (key) => (key === 'all_day' ? 'All day' : key),
  };

  vm.runInNewContext(
    `${eventDetailScript}\nglobalThis.formatEventDateRangeForTest = formatEventDateRange;`,
    context,
  );

  return context.formatEventDateRangeForTest(event);
}

test('renders an all-day event without an end date as a single date', () => {
  assert.equal(
    formatEventDateRange({
      allDay: true,
      startDate: '2030-06-14T00:00:00.000Z',
      endDate: null,
    }),
    'Friday, June 14, 2030 / All day',
  );
});
