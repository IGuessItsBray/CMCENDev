const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { Element } = require('./helpers/dashboard-dom');

function setup() {
  class ModalElement extends Element {
    classList = { add() {}, remove() {}, toggle() {} };
  }
  const document = {
    body: new ModalElement('body'),
    createElement: (tag) => new ModalElement(tag),
  };
  const window = { requestAnimationFrame: (callback) => callback() };
  window.parent = window;
  const source = fs.readFileSync(
    path.join(__dirname, '../public/app-utils.js'),
    'utf8',
  );
  vm.runInNewContext(
    source.slice(
      source.indexOf('  let modalOverlay ='),
      source.indexOf('  function trackPageVisit()'),
    ),
    {
      window,
      document,
      HTMLElement: ModalElement,
      translateText: (_key, fallback) => fallback,
    },
  );
  return { document, modal: window.CMCENModal };
}

test('async confirmation stays open, prevents duplicates and dismissal, then closes on success', async () => {
  const { document, modal } = setup();
  let finish;
  let calls = 0;
  const result = modal.confirm('Delete content?', {
    busyText: 'Deleting…',
    onConfirm: () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  await Promise.resolve();
  const overlay = document.body.children[0];
  const confirm = overlay.querySelector('.cmcen-modal-button-primary');
  const cancel = overlay.querySelector('.cmcen-modal-button-secondary');
  const close = overlay.querySelector('.cmcen-modal-close');
  const pending = confirm.fire('click');
  assert.equal(confirm.getAttribute('aria-busy'), 'true');
  assert.equal(confirm.textContent, 'Deleting…');
  assert.ok(confirm.disabled && cancel.disabled && close.disabled);
  await confirm.fire('click');
  await cancel.fire('click');
  await close.fire('click');
  await overlay.fire('click', { target: overlay });
  await overlay.fire('keydown', { key: 'Escape' });
  assert.equal(calls, 1);
  assert.equal(overlay.hidden, false);
  finish();
  await pending;
  assert.equal(await result, true);
  assert.equal(overlay.hidden, true);
  assert.equal(confirm.getAttribute('aria-busy'), null);
});

test('failed confirmation shows the error and allows retry or cancellation', async () => {
  const { document, modal } = setup();
  let calls = 0;
  const result = modal.confirm('Delete content?', {
    onConfirm: async () => {
      if (++calls === 1) throw new Error('Delete failed');
    },
  });
  await Promise.resolve();
  const overlay = document.body.children[0];
  const confirm = overlay.querySelector('.cmcen-modal-button-primary');
  await confirm.fire('click');
  assert.equal(overlay.hidden, false);
  assert.equal(confirm.disabled, false);
  assert.equal(confirm.getAttribute('aria-busy'), null);
  const error = overlay
    .querySelectorAll('p')
    .find((element) => element.getAttribute('role') === 'alert');
  assert.equal(error.textContent, 'Delete failed');
  await confirm.fire('click');
  assert.equal(await result, true);
  assert.equal(calls, 2);

  const cancelled = modal.confirm('Another action?');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(error.getAttribute('role'), null);
  await overlay.querySelector('.cmcen-modal-button-secondary').fire('click');
  assert.equal(await cancelled, false);
});
