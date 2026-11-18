const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('Contact announces validation, pending, error, and success without duplicate sends', async () => {
  let submit;
  let valid = false;
  let response;
  let sent = 0;
  let resets = 0;
  let validation = 0;
  const label = {};
  const message = {};
  const button = { querySelector: () => label, setAttribute() {} };
  const elements = {
    contactForm: {
      addEventListener(_event, handler) {
        submit = handler;
      },
      checkValidity: () => valid,
      reportValidity: () => validation++,
      reset: () => resets++,
    },
    contactSubject: { value: 'Synthetic subject' },
    contactBody: { value: 'Synthetic message' },
    contactMessage: message,
    contactSubmitButton: button,
    contactProfileDetails: { replaceChildren() {} },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../public/contact.js'), 'utf8'),
    {
      CMCENUtils: {
        requireAuthToken: () => 'synthetic',
        async apiJson(url) {
          if (url === '/api/me') return {};
          sent++;
          return new Promise((resolve, reject) => {
            response = { resolve, reject };
          });
        },
      },
      document: { getElementById: (id) => elements[id] },
      window: { location: { pathname: '/contact' } },
      translate: (key) => key,
    },
  );
  const event = { preventDefault() {} };
  await submit(event);
  assert.equal(sent, 0);
  assert.equal(validation, 1);
  assert.equal(message.textContent, 'contact_required_fields');
  valid = true;
  const first = submit(event);
  assert.equal(label.textContent, 'contact_sending');
  assert.equal(button.disabled, true);
  await submit(event);
  assert.equal(sent, 1);
  response.reject(new Error('Synthetic failure'));
  await first;
  assert.equal(button.disabled, false);
  assert.equal(message.textContent, 'Synthetic failure');
  assert.equal(resets, 0);
  const second = submit(event);
  response.resolve(null);
  await second;
  assert.equal(message.textContent, 'contact_send_uncertain');
  assert.equal(resets, 0);
  const third = submit(event);
  response.resolve({ message: 'Your message has been sent.' });
  await third;
  assert.equal(message.textContent, 'contact_success');
  assert.equal(resets, 1);
});
