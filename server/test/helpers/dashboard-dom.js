// A small DOM boundary for controller tests. Native validity is tested separately.
class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this.textContent = '';
    this.validity = { valid: true };
    this.isConnected = true;
  }
  append(...children) {
    children.forEach((child) => {
      child.parent = this;
    });
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children.forEach((child) => {
      child.isConnected = false;
    });
    this.children = [];
    this.append(...children);
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
  getAttribute(key) {
    return this.attributes[key] || null;
  }
  removeAttribute(key) {
    delete this.attributes[key];
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  async fire(type, extra = {}) {
    const event = { preventDefault() {}, detail: 1, ...extra };
    for (const fn of this.listeners[type] || []) await fn(event);
    if (type === 'input' || type === 'change')
      await this.parent?.fire(type, extra);
  }
  matches(selector) {
    if (selector === ':disabled') return this.disabled === true;
    if (selector.startsWith('.'))
      return (this.className || '').split(' ').includes(selector.slice(1));
    if (selector === 'input:checked')
      return this.tagName === 'INPUT' && this.checked;
    if (selector === 'button[data-account-action]')
      return this.tagName === 'BUTTON' && Boolean(this.dataset.accountAction);
    if (selector === '[data-permission-label]')
      return Boolean(this.dataset.permissionLabel);
    if (selector.startsWith('[')) return false;
    return this.tagName === selector.toUpperCase();
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  closest(selector) {
    return this.matches(selector)
      ? this
      : this.parent?.closest(selector) || null;
  }
  get elements() {
    return ['input', 'select', 'textarea', 'button'].flatMap((tag) =>
      this.querySelectorAll(tag),
    );
  }
  focus() {}
}

module.exports = { Element };
