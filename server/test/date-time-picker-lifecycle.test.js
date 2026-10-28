const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getEventListeners } = require('node:events');
const test = require('node:test');
const { Element: BaseElement } = require('./helpers/dashboard-dom');

function setup() {
  const document = new EventTarget(),
    window = new EventTarget();
  class Element extends BaseElement {
    constructor(tag) {
      super(tag);
      this.style.setProperty = (key, value) => {
        this.style[key] = value;
      };
      this.classList = {
        contains: (name) => (this.className || '').split(' ').includes(name),
        toggle: (name, enabled) => {
          const values = new Set((this.className || '').split(' '));
          if (enabled) values.add(name);
          else values.delete(name);
          this.className = [...values].join(' ');
        },
      };
    }
    get parentElement() {
      return this.parent;
    }
    append(...children) {
      for (const child of children) {
        if (child.parent)
          child.parent.children = child.parent.children.filter(
            (value) => value !== child,
          );
      }
      super.append(...children);
    }
    prepend(...children) {
      for (const child of children) {
        if (child.parent)
          child.parent.children = child.parent.children.filter(
            (value) => value !== child,
          );
        child.parent = this;
      }
      this.children.unshift(...children);
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter(
          (value) => value !== this,
        );
      this.parent = null;
      this.isConnected = false;
    }
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter(
        (value) => value !== fn,
      );
    }
    dispatchEvent(event) {
      void this.fire(event.type, { stopPropagation() {} });
      return true;
    }
    focus() {
      document.activeElement = this;
    }
    getBoundingClientRect() {
      if (this.rect) return this.rect;
      const height = Math.min(
        420,
        parseFloat(this.style['--date-popover-max-height']) || Infinity,
      );
      const left = parseFloat(this.style['--date-popover-left']) || 0;
      const top = parseFloat(this.style['--date-popover-top']) || 0;
      const width = parseFloat(this.style['--date-popover-width']) || 360;
      return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
      };
    }
  }
  document.createElement = (tag) => new Element(tag);
  document.body = new Element('body');
  document.documentElement = { lang: 'en' };
  document.readyState = 'loading';
  document.querySelectorAll = () => [];
  window.innerWidth = 1000;
  window.innerHeight = 720;
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/date-time-picker.js'),
      'utf8',
    ),
    { document, window, Event, CustomEvent },
  );
  const create = (options) => {
    const picker = window.CMCENDateTimePicker.create(options);
    document.body.append(picker);
    const trigger = picker.querySelector('.cmcen-date-time-trigger');
    trigger.rect = { left: 960, right: 1000, top: 596, bottom: 640 };
    return {
      picker,
      trigger,
      popover: picker.querySelector('.cmcen-date-time-popover'),
    };
  };
  const click = (element) => element.fire('click', { stopPropagation() {} });
  const listeners = () =>
    ['click', 'keydown']
      .map((name) => getEventListeners(document, name).length)
      .concat(
        ['resize', 'scroll', 'cmcen:picker-open'].map(
          (name) => getEventListeners(window, name).length,
        ),
      );
  return { create, click, listeners, document, window };
}

test('shared date-only picker portals outside clipping containers, opens inward and follows resize/scroll', async () => {
  const page = setup();
  let value;
  const { picker, trigger, popover } = page.create({
    includeTime: false,
    date: '2026-08-01',
    onInput: (next) => {
      value = next;
    },
  });
  await page.click(trigger);
  assert.equal(popover.parentElement, page.document.body);
  let bounds = popover.getBoundingClientRect();
  assert.equal(bounds.right, 988);
  assert.ok(bounds.top >= 12);
  assert.ok(bounds.bottom <= 708);
  const day = popover
    .querySelectorAll('button')
    .find(
      (element) =>
        element.className.includes('date-time-day') &&
        element.textContent === '2',
    );
  await page.click(day);
  assert.equal(value.date, '2026-08-02');
  assert.equal(value.time, '');
  assert.equal(picker.querySelectorAll('input').length, 1);
  trigger.rect = { left: 340, right: 378, top: 440, bottom: 484 };
  page.window.innerWidth = 390;
  page.window.innerHeight = 600;
  page.window.dispatchEvent(new Event('resize'));
  page.window.dispatchEvent(new Event('scroll'));
  bounds = popover.getBoundingClientRect();
  assert.equal(bounds.left, 18);
  assert.equal(bounds.right, 378);
  assert.ok(bounds.top >= 12);
  assert.ok(bounds.bottom <= 588);
  page.document.dispatchEvent(new Event('click'));
  assert.equal(popover.parentElement, picker);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  picker.destroy();
  assert.deepEqual(page.listeners(), [0, 0, 0, 0, 0]);
});

test('time-capable consumers retain values, other picker opening and Escape dismiss, and destroy removes an open portal', async () => {
  const page = setup(),
    a = page.create({ date: '2026-08-01', time: '13:45' }),
    b = page.create({ includeTime: false });
  await page.click(a.trigger);
  assert.equal(a.picker.getValue().time, '13:45');
  await page.click(b.trigger);
  assert.equal(a.trigger.getAttribute('aria-expanded'), 'false');
  const escape = new Event('keydown');
  Object.defineProperty(escape, 'key', { value: 'Escape' });
  page.document.dispatchEvent(escape);
  assert.equal(b.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(page.document.activeElement, b.trigger);
  await page.click(a.trigger);
  a.picker.destroy();
  b.picker.destroy();
  assert.equal(a.popover.parentElement, null);
  assert.deepEqual(page.listeners(), [0, 0, 0, 0, 0]);
});
