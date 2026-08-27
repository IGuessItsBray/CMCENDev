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

test('loads a signed-in attendee\'s RSVP state with the event', () => {
  assert.match(
    eventDetailScript,
    /const token = getStoredToken\(\);\s+const response = await fetch\([\s\S]*Authorization: `Bearer \$\{token\}`/u,
  );

  const elements = new Map();
  const createElement = () => ({
    children: [],
    hidden: false,
    textContent: '',
    className: '',
    classList: {
      remove() {},
      toggle() {},
    },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    addEventListener() {},
    replaceChildren(...children) { this.children = children; },
    removeAttribute() {},
    setAttribute() {},
  });
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, createElement());
    return elements.get(id);
  };
  const context = {
    document: {
      addEventListener() {},
      createElement,
      getElementById: getElement,
    },
    URLSearchParams,
    CMCENUtils: {
      getCurrentLanguage: () => 'en',
      getCurrentLocale: () => 'en-CA',
      getStoredAuthToken: () => 'test-token',
    },
    window: { location: { pathname: '/event', search: '' } },
    translate: (key) => ({
      event_rsvp_accepted: 'Your attendance has been recorded.',
      event_rsvp_declined: 'Your decline has been recorded.',
      event_rsvp_cancel: 'Cancel RSVP',
    })[key] || key,
  };

  vm.runInNewContext(
    `${eventDetailScript}\nglobalThis.renderRsvpForTest = renderRsvp;`,
    context,
  );
  context.renderRsvpForTest({
    rsvpEnabled: true,
    myRsvp: { response: 'accepted' },
  });

  assert.equal(
    getElement('eventRsvpMessage').textContent,
    'Your attendance has been recorded.',
  );
  assert.equal(getElement('eventRsvpActions').children.length, 1);
  assert.equal(getElement('eventRsvpActions').children[0].textContent, 'Cancel RSVP');
});
