const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '../public/dashboard-next.js'),
  'utf8',
);
const flush = () => new Promise(setImmediate);

test('banner statuses follow enabled state and inclusive public schedule boundaries', () => {
  const window = {};
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/dashboard-next-banners.js'),
      'utf8',
    ),
    { window },
  );
  const { getBannerStatus, nextStatusChange } = window.DashboardNextBanners;
  const now = Date.parse('2026-09-18T12:00:00Z');
  const time = (offset) => new Date(now + offset).toISOString();
  assert.equal(getBannerStatus({ enabled: true }, now), 'enabled');
  assert.equal(
    getBannerStatus(
      { enabled: false, startsAt: time(10), endsAt: time(-10) },
      now,
    ),
    'disabled',
  );
  assert.equal(
    getBannerStatus({ enabled: true, startsAt: time(1) }, now),
    'scheduled',
  );
  assert.equal(
    getBannerStatus({ enabled: true, startsAt: time(0) }, now),
    'enabled',
  );
  assert.equal(
    getBannerStatus({ enabled: true, endsAt: time(0) }, now),
    'enabled',
  );
  assert.equal(
    getBannerStatus({ enabled: true, endsAt: time(-1) }, now),
    'disabled',
  );
  assert.equal(
    getBannerStatus({ enabled: true, countdownAt: time(-100) }, now),
    'enabled',
  );
  assert.equal(nextStatusChange([{ enabled: true }], now), null);
  assert.equal(
    nextStatusChange([{ enabled: false, startsAt: time(1) }], now),
    now + 1,
  );
  assert.equal(
    nextStatusChange(
      [{ enabled: true, startsAt: time(100), endsAt: time(200) }],
      now,
    ),
    now + 100,
  );
  assert.equal(
    nextStatusChange([{ enabled: true, endsAt: time(0) }], now),
    now + 1,
  );
  assert.equal(
    nextStatusChange([{ enabled: true, endsAt: time(-1) }], now),
    null,
  );
});

test('banner name and both languages validate with no scheduling dates', async () => {
  const window = { translate: () => 'Required' };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/dashboard-next-banners.js'),
      'utf8',
    ),
    { window },
  );
  const values = {
    title: 'Notice',
    textEn: 'English',
    textFr: 'Français',
    color: '#123456',
    textColor: '#ffffff',
    placement: 'global',
    screenPosition: 'header',
    enabled: true,
    scrolling: false,
    dismissible: true,
    icon: 'none',
    scheduleEnabled: false,
    countdownEnabled: false,
    order: '0',
    startsAt: '',
    endsAt: '',
    countdownAt: '',
  };
  const inputs = Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      {
        value,
        checked: value,
        error: '',
        setCustomValidity(message) {
          this.error = message;
        },
      },
    ]),
  );
  const form = {
    elements: { namedItem: (name) => inputs[name] },
    reportValidity: () => Object.values(inputs).every((input) => !input.error),
  };
  assert.equal(window.DashboardNextBanners.validate(form), true);
  // A partially edited native date has an empty value but reports badInput
  // until assigning an empty value clears its internal editing state.
  for (const name of ['startsAt', 'endsAt', 'countdownAt']) {
    let badInput = true;
    Object.defineProperty(inputs[name], 'value', {
      configurable: true,
      get: () => '',
      set: (value) => {
        assert.equal(value, '');
        badInput = false;
      },
    });
    form.reportValidity = () =>
      !badInput && Object.values(inputs).every((input) => !input.error);
    assert.equal(window.DashboardNextBanners.validate(form), true);
    assert.equal(badInput, false);
  }
  const data = window.DashboardNextBanners.payload(form);
  for (const name of ['startsAt', 'endsAt', 'countdownAt'])
    assert.equal(data[name], null);
  const Timer = require('../models/Timer');
  await new Timer(data).validate();
  for (const name of ['title', 'textEn', 'textFr']) {
    inputs[name].value = '   ';
    assert.equal(window.DashboardNextBanners.validate(form), false);
    inputs[name].value = values[name];
    assert.equal(window.DashboardNextBanners.validate(form), true);
  }
});

test('banner schedule labels change tense at the public schedule boundaries', () => {
  const window = { translate: (key) => key };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/dashboard-next-banners.js'),
      'utf8',
    ),
    {
      window,
      CMCENUtils: { getCurrentLocale: () => 'en-CA' },
    },
  );
  const { scheduleText } = window.DashboardNextBanners;
  const now = Date.parse('2026-09-18T12:00:00Z');
  const timer = {
    startsAt: new Date(now).toISOString(),
    endsAt: new Date(now + 10).toISOString(),
  };
  assert.equal(
    scheduleText(timer, now - 1),
    'admin_next_banner_starts\nadmin_next_banner_ends',
  );
  assert.equal(
    scheduleText(timer, now),
    'admin_next_banner_started\nadmin_next_banner_ends',
  );
  assert.equal(
    scheduleText(timer, now + 10),
    'admin_next_banner_started\nadmin_next_banner_ends',
  );
  assert.equal(
    scheduleText(timer, now + 11),
    'admin_next_banner_started\nadmin_next_banner_ended',
  );
});

test('custom picker validation reports missing or past starts and missing countdown targets', () => {
  const window = { translate: (key) => key };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/dashboard-next-banners.js'),
      'utf8',
    ),
    { window },
  );
  const inputs = Object.fromEntries(
    [
      'title',
      'textEn',
      'textFr',
      'startsAt',
      'endsAt',
      'countdownAt',
      'scheduleEnabled',
      'countdownEnabled',
    ].map((name) => [
      name,
      {
        value: ['title', 'textEn', 'textFr'].includes(name) ? 'Text' : '',
        checked: false,
        setCustomValidity() {},
      },
    ]),
  );
  // Hidden canonical inputs cannot use native required-field validation.
  const form = {
    elements: { namedItem: (name) => inputs[name] },
    reportValidity: () => true,
  };
  let invalid;
  const validate = () =>
    window.DashboardNextBanners.validate(form, (name) => {
      invalid = name;
    });
  assert.equal(validate(), true);
  inputs.scheduleEnabled.checked = true;
  assert.equal(validate(), false);
  assert.equal(invalid, 'startsAt');
  inputs.startsAt.value = new Date(Date.now() - 60000).toISOString();
  assert.equal(validate(), false);
  inputs.startsAt.value = new Date(Date.now() + 60000).toISOString();
  assert.equal(validate(), true);
  inputs.countdownEnabled.checked = true;
  assert.equal(validate(), false);
  assert.equal(invalid, 'countdownAt');
  inputs.countdownAt.value = inputs.startsAt.value;
  assert.equal(validate(), true);
});

test('turning timing controls off clears payload dates without losing entered values', () => {
  const window = {};
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/dashboard-next-banners.js'),
      'utf8',
    ),
    { window },
  );
  const values = Object.fromEntries(
    [
      'title',
      'textEn',
      'textFr',
      'color',
      'textColor',
      'placement',
      'screenPosition',
      'icon',
      'order',
    ].map((name) => [name, { value: '' }]),
  );
  for (const name of ['startsAt', 'endsAt', 'countdownAt'])
    values[name] = { value: '2026-09-18T12:00' };
  for (const name of [
    'scheduleEnabled',
    'countdownEnabled',
    'enabled',
    'scrolling',
    'dismissible',
  ])
    values[name] = { checked: true };
  const form = { elements: { namedItem: (name) => values[name] } };
  window.DashboardNextBanners.setDeliveryChoice(form, 'scheduled');
  assert.equal(values.enabled.checked, false);
  assert.equal(values.scheduleEnabled.checked, true);
  const before = window.DashboardNextBanners.payload(form);
  assert.equal(before.enabled, true);
  assert.equal(before.scrolling, true);
  assert.equal(before.dismissible, true);
  window.DashboardNextBanners.setDeliveryChoice(form, 'disabled');
  values.countdownEnabled.checked = false;
  const after = window.DashboardNextBanners.payload(form);
  assert.equal(after.enabled, false);
  for (const name of ['startsAt', 'endsAt', 'countdownAt']) {
    assert.equal(after[name], null);
    assert.equal(values[name].value, '2026-09-18T12:00');
  }
  window.DashboardNextBanners.setDeliveryChoice(form, 'scheduled');
  assert.equal(
    window.DashboardNextBanners.payload(form).startsAt,
    before.startsAt,
  );
  window.DashboardNextBanners.setDeliveryChoice(form, 'enabled');
  assert.equal(values.scheduleEnabled.checked, false);
  assert.equal(values.enabled.checked, true);
  values.startsAt.value = '2099-09-18T12:00';
  const immediate = window.DashboardNextBanners.payload(form);
  assert.equal(immediate.enabled, true);
  assert.equal(immediate.startsAt, null);
  assert.equal(immediate.endsAt, before.endsAt);
});

function setup({
  token = 'test-token',
  api = async () => ({ permissions: { canReadUsers: true } }),
  url = 'http://localhost/dashboard-next',
  signals = AbortSignal,
} = {}) {
  const events = {};
  const elements = new Map();
  const messages = ['loading', 'signed-out', 'denied', 'error'].map(
    (state) => ({ dataset: { shellState: state } }),
  );
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        dataset: {},
        attributes: {},
        hidden: true,
        listeners: {},
        setAttribute(key, value) {
          this.attributes[key] = value;
        },
        removeAttribute(key) {
          delete this.attributes[key];
        },
        focus() {},
        querySelector() {
          return {};
        },
        addEventListener(key, handler) {
          this.listeners[key] = handler;
        },
        querySelectorAll() {
          return messages;
        },
      });
    return elements.get(id);
  };
  let timeout;
  let calls = 0;
  let redirect = null;
  let cleared = false;
  let mounted = 0;
  let awardsMounted = 0;
  let contentMounted = 0;
  let contentDisposed = 0;
  let contentOptions;
  let contentDirty = false;
  let awardsDisposed = 0;
  let awardsOptions;
  let usersOptions;
  let rolesOptions;
  let mediaOptions,
    mediaMounted = 0,
    mediaDisposed = 0;
  let certificatesOptions,
    certificatesMounted = 0,
    certificatesDisposed = 0;
  let analyticsOptions,
    analyticsMounted = 0,
    analyticsDisposed = 0;
  let auditOptions,
    auditMounted = 0,
    auditDisposed = 0;
  let translationsOptions;
  let translationsMounted = 0;
  let translationsDisposed = 0;
  let translationsDirty = false;
  let pagesOptions;
  let pagesMounted = 0;
  let pagesDirty = false;
  let subscriptionsOptions;
  let subscriptionsMounted = 0;
  let subscriptionsDirty = false;
  let rolesMounted = 0;
  let rolesDirty = false;
  let synchronizedRoles;
  let awardsDirty = false;
  let navigationBusy = false;
  let canLeave = true;
  const documentEvents = {};
  let confirmation = async () => canLeave && !awardsDirty;
  let mountOptions;
  let signedOut = false;
  const utils = {
    signOut: async () => {
      signedOut = true;
    },
    getStoredAuthToken: () => token,
    clearAuthToken: () => {
      token = '';
      cleared = true;
    },
    apiJson: (...args) => {
      calls += 1;
      return api(...args);
    },
    apiFetch: (...args) => api(...args),
  };
  const window = {
    location: {
      href: url,
      replace: (path) => {
        redirect = path;
      },
      assign: (path) => {
        redirect = path;
      },
    },
    history: {
      replaceState: (state, title, next) => {
        window.location.href = String(next);
      },
      pushState: (state, title, next) => {
        window.location.href = String(next);
      },
    },
    translate: (key) => key,
    CMCENModal: { confirm: (...args) => confirmation(...args) },
    DashboardNextUsers: {
      mount: (options) => {
        usersOptions = options;
        return {
          updateRoles(roles) {
            synchronizedRoles = roles;
          },
          dispose() {},
          canNavigate: () => true,
          hasUnsavedChanges: () => false,
        };
      },
    },
    DashboardNextBanners: {
      mount: (options) => {
        mountOptions = options;
        mounted += 1;
        return {
          dispose() {},
          canLeave: () => canLeave,
          canNavigate: () => !navigationBusy,
          hasUnsavedChanges: () => !canLeave,
        };
      },
    },
    DashboardNextRoles: {
      mount: (options) => {
        rolesOptions = options;
        rolesMounted += 1;
        return {
          dispose() {},
          canNavigate: () => true,
          hasUnsavedChanges: () => rolesDirty,
        };
      },
    },
    DashboardNextMedia: {
      mount: (options) => {
        mediaOptions = options;
        mediaMounted++;
        return {
          dispose() {
            mediaDisposed++;
          },
          canNavigate: () => true,
          hasUnsavedChanges: () => false,
        };
      },
    },
    CertificateRequests: {
      mount: (options) => {
        certificatesOptions = options;
        certificatesMounted++;
        return {
          dispose() {
            certificatesDisposed++;
          },
          canNavigate: () => !navigationBusy,
          hasUnsavedChanges: () => navigationBusy,
        };
      },
    },
    AnalyticsController: {
      mount: (options) => {
        analyticsOptions = options;
        analyticsMounted++;
        return {
          dispose() {
            analyticsDisposed++;
          },
          canNavigate: () => true,
          hasUnsavedChanges: () => false,
        };
      },
    },
    AuditLogController: {
      mount: (options) => {
        auditOptions = options;
        auditMounted++;
        return {
          dispose() {
            auditDisposed++;
          },
          canNavigate: () => !navigationBusy,
          hasUnsavedChanges: () => navigationBusy,
        };
      },
    },
    TranslationsEditor: {
      mount: (options) => {
        translationsOptions = options;
        translationsMounted += 1;
        return {
          dispose() {
            translationsDisposed += 1;
          },
          canNavigate: () => !navigationBusy,
          hasUnsavedChanges: () => translationsDirty,
        };
      },
    },
    PagesEditor: {
      mount: (options) => {
        pagesOptions = options;
        pagesMounted += 1;
        return {
          dispose() {},
          canNavigate: () => !navigationBusy,
          hasUnsavedChanges: () => pagesDirty,
        };
      },
    },
    DashboardNextSubscriptions: {
      mount: (options) => {
        subscriptionsOptions = options;
        subscriptionsMounted += 1;
        return {
          dispose() {},
          canNavigate: () => !navigationBusy,
          hasUnsavedChanges: () => subscriptionsDirty,
        };
      },
    },
    DashboardNextAwards: {
      mount: (options) => {
        awardsOptions = options;
        awardsMounted += 1;
        return {
          dispose: () => {
            awardsDisposed += 1;
          },
          canLeave: () => !awardsDirty,
          canNavigate: () => !navigationBusy,
          hasUnsavedChanges: () => awardsDirty,
        };
      },
    },
    ContentWorkspace: {
      mount: (options) => {
        contentOptions = options;
        contentMounted++;
        return {
          dispose: () => {
            contentDisposed++;
          },
          hasUnsavedChanges: () => contentDirty,
          canNavigate: () => !navigationBusy,
        };
      },
    },
    addEventListener: (key, handler) => {
      events[key] = handler;
    },
    setTimeout: (handler) => {
      timeout = handler;
      return 1;
    },
    clearTimeout: () => {},
  };
  vm.runInNewContext(source, {
    window,
    document: {
      getElementById: element,
      addEventListener(key, handler) {
        documentEvents[key] = handler;
      },
    },
    CMCENUtils: utils,
    AbortController,
    AbortSignal: signals,
    URL,
  });
  return {
    window,
    contentMounted: () => contentMounted,
    contentDisposed: () => contentDisposed,
    contentArea: () => contentOptions,
    setContentDirty: (value) => {
      contentDirty = value;
    },
    events,
    documentEvents,
    setConfirmation: (handler) => {
      confirmation = handler;
    },
    element,
    state: () => element('dashboardNext').dataset.state,
    calls: () => calls,
    redirect: () => redirect,
    cleared: () => cleared,
    mounted: () => mounted,
    awardsMounted: () => awardsMounted,
    awardsDisposed: () => awardsDisposed,
    awardsArea: () => awardsOptions,
    usersArea: () => usersOptions,
    rolesArea: () => rolesOptions,
    mediaArea: () => mediaOptions,
    mediaMounted: () => mediaMounted,
    mediaDisposed: () => mediaDisposed,
    certificatesArea: () => certificatesOptions,
    certificatesMounted: () => certificatesMounted,
    certificatesDisposed: () => certificatesDisposed,
    analyticsArea: () => analyticsOptions,
    analyticsMounted: () => analyticsMounted,
    analyticsDisposed: () => analyticsDisposed,
    auditArea: () => auditOptions,
    auditMounted: () => auditMounted,
    auditDisposed: () => auditDisposed,
    translationsArea: () => translationsOptions,
    translationsMounted: () => translationsMounted,
    translationsDisposed: () => translationsDisposed,
    setTranslationsDirty: (value) => {
      translationsDirty = value;
    },
    pagesArea: () => pagesOptions,
    pagesMounted: () => pagesMounted,
    setPagesDirty: (value) => {
      pagesDirty = value;
    },
    subscriptionsArea: () => subscriptionsOptions,
    subscriptionsMounted: () => subscriptionsMounted,
    setSubscriptionsDirty: (value) => {
      subscriptionsDirty = value;
    },
    rolesMounted: () => rolesMounted,
    synchronizedRoles: () => synchronizedRoles,
    setRolesDirty: (value) => {
      rolesDirty = value;
    },
    setAwardsDirty: (value) => {
      awardsDirty = value;
    },
    setNavigationBusy: (value) => {
      navigationBusy = value;
    },
    area: () => mountOptions,
    signedOut: () => signedOut,
    setCanLeave: (value) => {
      canLeave = value;
    },
    setToken: (value) => {
      token = value;
    },
    expire: () => timeout(),
  };
}

test('Roles uses permission-gated persistent mounting and synchronizes mounted Users', async () => {
  const page = setup({
    api: async () => ({
      permissions: { canReadUsers: true, canManageRoles: true },
    }),
  });
  await flush();
  page.window.location.href = 'http://localhost/dashboard-next?area=roles';
  await page.events.popstate();
  assert.equal(page.rolesMounted(), 1);
  page.setRolesDirty(true);
  const roles = [{ _id: 'custom', name: 'Updated' }];
  page.rolesArea().onRolesChanged(roles);
  assert.equal(page.synchronizedRoles(), roles);
  page.window.location.href = 'http://localhost/dashboard-next?area=users';
  await page.events.popstate();
  assert.equal(page.element('adminRoles').hidden, true);
  let guarded = false;
  page.events.beforeunload({
    preventDefault() {
      guarded = true;
    },
  });
  assert.equal(guarded, true);
  page.window.location.href = 'http://localhost/dashboard-next?area=roles';
  await page.events.popstate();
  assert.equal(page.rolesMounted(), 1);
  page.rolesArea().onDenied();
  assert.equal(page.element('adminRoles').hidden, true);
  const denied = setup({ url: 'http://localhost/dashboard-next?area=roles' });
  await flush();
  assert.equal(denied.rolesMounted(), 0);
});

test('Subscriptions mounts only with permission, retains drafts, and keeps long sends cancellable', async () => {
  const timeouts = [];
  const requests = [];
  const page = setup({
    api: async (path, options) => {
      requests.push({ path, options });
      return {
        permissions: { canManageSubscriptions: true, canReadUsers: true },
      };
    },
    url: 'http://localhost/dashboard-next?area=subscriptions',
    signals: {
      any: AbortSignal.any,
      timeout: (ms) => {
        timeouts.push(ms);
        return new AbortController().signal;
      },
    },
  });
  await flush();
  assert.equal(page.subscriptionsMounted(), 1);
  await page.subscriptionsArea().api('/api/admin/subscriptions');
  assert.deepEqual(timeouts, [15000]);
  const caller = new AbortController();
  await page.subscriptionsArea().api('/api/admin/subscriptions/news-blasts', {
    method: 'POST',
    timeoutMs: null,
    signal: caller.signal,
  });
  assert.deepEqual(timeouts, [15000]);
  assert.equal(requests.at(-1).options.timeoutMs, undefined);
  caller.abort();
  assert.equal(requests.at(-1).options.signal.aborted, true);
  page.setSubscriptionsDirty(true);
  page.window.location.href = 'http://localhost/dashboard-next?area=users';
  await page.events.popstate();
  let guarded = false;
  page.events.beforeunload({
    preventDefault() {
      guarded = true;
    },
  });
  assert.equal(guarded, true);
  page.window.location.href =
    'http://localhost/dashboard-next?area=subscriptions';
  await page.events.popstate();
  assert.equal(page.subscriptionsMounted(), 1);
  const denied = setup({
    url: 'http://localhost/dashboard-next?area=subscriptions',
  });
  await flush();
  assert.equal(denied.subscriptionsMounted(), 0);
});

test('keyboard navigation restores focus cues after pointer interaction', () => {
  const page = setup({ token: '' });
  const shell = page.element('dashboardNext');
  page.documentEvents.pointerdown({});
  assert.equal(shell.dataset.inputModality, 'pointer');
  page.documentEvents.keydown({ key: 'a' });
  assert.equal(shell.dataset.inputModality, 'pointer');
  page.documentEvents.keydown({ key: 'Tab' });
  assert.equal(shell.dataset.inputModality, 'keyboard');
  page.documentEvents.pointerdown({});
  page.documentEvents.keydown({ key: 'ArrowDown' });
  assert.equal(shell.dataset.inputModality, 'keyboard');
});

test('signed-out visitors redirect to login without an account request', async () => {
  const page = setup({ token: '' });
  await flush();
  assert.equal(page.state(), 'signed-out');
  assert.equal(page.calls(), 0);
  assert.equal(page.redirect(), '/login');
  assert.equal(page.element('dashboardNextContent').hidden, true);
});

test('viewer and contribution-only permissions cannot enter administration', async () => {
  for (const permissions of [
    {},
    { canCreateDrafts: true, canUploadMedia: true },
    { canReadUsers: 'true' },
  ]) {
    const page = setup({
      api: async () => ({ role: 'administrator', permissions }),
    });
    await flush();
    assert.equal(page.state(), 'denied');
    assert.equal(page.redirect(), null);
    assert.equal(page.element('dashboardNextAccount').hidden, false);
    assert.equal(page.window.dashboardNext.getSession(), null);
    assert.equal(page.element('dashboardNextContent').hidden, true);
  }
});

test('custom administrative permissions admit a user without a privileged role', async () => {
  const user = {
    role: 'subscriber',
    permissions: { canManageTranslations: true },
  };
  const page = setup({
    api: async (url, options) => {
      assert.equal(url, '/api/me');
      assert.equal(options.cache, 'no-store');
      return user;
    },
  });
  await flush();
  assert.equal(page.state(), 'ready');
  assert.equal(page.calls(), 1);
  assert.equal(page.window.dashboardNext.getSession(), user);
  assert.equal(page.element('dashboardNextContent').hidden, false);
  assert.equal(page.element('dashboardNext').attributes['aria-busy'], 'false');
  page.events.pageshow({ persisted: false });
  assert.equal(page.calls(), 1);
});

test('expired, forbidden, failed, and malformed responses fail closed', async () => {
  for (const [status, expected] of [
    [401, 'signed-out'],
    [403, 'denied'],
    [500, 'error'],
    [undefined, 'error'],
  ]) {
    const page = setup({
      api: async () => {
        throw Object.assign(new Error(), { status });
      },
    });
    await flush();
    assert.equal(page.state(), expected);
    assert.equal(page.redirect(), status === 401 ? '/login' : null);
    assert.equal(page.cleared(), status === 401);
    assert.equal(page.element('dashboardNextContent').hidden, true);
  }
  const page = setup({ api: async () => ({}) });
  await flush();
  assert.equal(page.state(), 'error');
});

test('retry recovers without replacing the shell', async () => {
  let fail = true;
  const page = setup({
    api: async () => {
      if (fail) throw new Error('offline');
      return { permissions: { canManagePages: true } };
    },
  });
  const shell = page.element('dashboardNext');
  await flush();
  assert.equal(page.state(), 'error');
  fail = false;
  await page.element('dashboardNextRetry').listeners.click();
  assert.equal(page.state(), 'ready');
  assert.equal(page.element('dashboardNext'), shell);
});

test('logout in another tab discards an in-flight response', async () => {
  let resolve;
  const page = setup({
    api: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  assert.equal(page.state(), 'loading');
  page.setToken('');
  page.events.storage({ key: 'token' });
  resolve({ permissions: { canReadUsers: true } });
  await flush();
  assert.equal(page.state(), 'signed-out');
  assert.equal(page.redirect(), '/login');
  assert.equal(page.window.dashboardNext.getSession(), null);
});

test('back-forward restoration rechecks access and discards previous session', async () => {
  const page = setup();
  await flush();
  page.events.pagehide();
  assert.equal(page.window.dashboardNext.getSession(), null);
  assert.equal(page.element('dashboardNextContent').hidden, true);
  page.events.pageshow({ persisted: true });
  await flush();
  assert.equal(page.calls(), 2);
  assert.equal(page.state(), 'ready');
});

test('a stalled request ends with a retryable error', async () => {
  const page = setup({
    api: (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  });
  page.expire();
  await flush();
  assert.equal(page.state(), 'error');
  assert.equal(page.element('dashboardNextRetry').hidden, false);
});

test('sidebar toggles accessible navigation without reloading the active editor', async () => {
  const page = setup({
    api: async () => ({ permissions: { canManageTimers: true } }),
  });
  await flush();
  const toggle = page.element('adminSidebarToggle');
  assert.equal(toggle.attributes['aria-expanded'], 'true');
  toggle.listeners.click();
  assert.equal(toggle.attributes['aria-expanded'], 'false');
  assert.equal(toggle.attributes['aria-label'], 'admin_next_expand_sidebar');
  assert.equal(page.element('adminSidebarContents').inert, true);
  assert.equal(
    page.element('adminSidebarContents').attributes['aria-hidden'],
    'true',
  );
  toggle.listeners.click();
  assert.equal(toggle.attributes['aria-expanded'], 'true');
  assert.equal(page.element('adminSidebarContents').inert, false);
  assert.equal(
    page.element('adminSidebarContents').attributes['aria-hidden'],
    'false',
  );
  assert.equal(page.calls(), 1);
  assert.equal(page.mounted(), 1);
});

test('Banners is the default URL destination only with its permission', async () => {
  const page = setup({
    api: async () => ({ permissions: { canManageTimers: true } }),
  });
  await flush();
  assert.equal(
    new URL(page.window.location.href).searchParams.get('area'),
    'banners',
  );
  assert.equal(
    page.element('adminBannersLink').attributes['aria-current'],
    'page',
  );
  assert.equal(page.mounted(), 1);
  await page.events.popstate();
  assert.equal(page.mounted(), 1);
});

test('a direct Banners URL cannot mount for an administrator without banner permission', async () => {
  const page = setup({ url: 'http://localhost/dashboard-next?area=banners' });
  await flush();
  assert.equal(page.state(), 'ready');
  assert.equal(page.element('adminBannersLink').hidden, true);
  assert.equal(page.element('adminBanners').hidden, true);
  assert.equal(page.mounted(), 0);
  assert.equal(
    page.element('adminAreaMessage').textContent,
    'admin_next_denied_title',
  );
});

test('Users admits read-only staff and combines caller cancellation with shell cancellation for exports', async () => {
  let signal;
  const actor = {
    _id: 'reader',
    role: 'subscriber',
    permissions: { canReadUsers: true },
  };
  const response = { blob: async () => 'download' };
  const page = setup({
    api: async (path, options) => {
      if (path === '/api/me') return actor;
      signal = options.signal;
      return response;
    },
  });
  await flush();
  assert.equal(page.element('adminUsers').hidden, false);
  assert.equal(page.usersArea().user, actor);
  assert.equal(page.usersArea().permissions.canManageUsers, undefined);
  const controller = new AbortController();
  assert.equal(
    await page.usersArea().api('/api/admin/users/export', {
      parseJson: false,
      signal: controller.signal,
    }),
    response,
  );
  assert.equal(signal.aborted, false);
  controller.abort();
  assert.equal(signal.aborted, true);
  const denied = setup({
    url: 'http://localhost/dashboard-next?area=users',
    api: async () => ({ permissions: { canManageTimers: true } }),
  });
  await flush();
  assert.equal(denied.usersArea(), undefined);
  assert.equal(denied.element('adminUsers').hidden, true);
});

test('unmigrated access is distinguished from unknown destinations', async () => {
  const page = setup({
    api: async () => ({ permissions: { canManageEventRsvps: true } }),
  });
  await flush();
  assert.equal(
    page.element('adminAreaMessage').textContent,
    'admin_next_no_areas',
  );
  page.window.location.href = 'http://localhost/dashboard-next?area=unknown';
  await page.events.popstate();
  assert.equal(
    page.element('adminAreaMessage').textContent,
    'admin_next_area_missing',
  );
});

test('history navigation reuses the banner editor and guards unsaved work', async () => {
  const page = setup({
    api: async () => ({ permissions: { canManageTimers: true } }),
  });
  await flush();
  page.setCanLeave(false);
  page.window.location.href = 'http://localhost/dashboard-next?area=unknown';
  await page.events.popstate();
  assert.equal(
    new URL(page.window.location.href).searchParams.get('area'),
    'banners',
  );
  page.setCanLeave(true);
  page.window.location.href = 'http://localhost/dashboard-next?area=unknown';
  await page.events.popstate();
  assert.equal(page.element('adminBanners').hidden, true);
  page.window.location.href = 'http://localhost/dashboard-next?area=banners';
  await page.events.popstate();
  assert.equal(page.element('adminBanners').hidden, false);
  assert.equal(page.mounted(), 1);
});

test('revoked banner access removes the editor and prevents mounting it again', async () => {
  const page = setup({
    api: async () => ({ permissions: { canManageTimers: true } }),
  });
  await flush();
  page.area().onDenied();
  assert.equal(page.element('adminBanners').hidden, true);
  assert.equal(page.element('adminBannersLink').hidden, true);
  await page.events.popstate();
  assert.equal(page.mounted(), 1);
});

test('expired authentication during an area request clears access and redirects', async () => {
  const page = setup({
    api: async (url) => {
      if (url === '/api/me') return { permissions: { canManageTimers: true } };
      throw Object.assign(new Error('Expired'), { status: 401 });
    },
  });
  await flush();
  await assert.rejects(page.area().api('/api/admin/timers'), { status: 401 });
  assert.equal(page.window.dashboardNext.getSession(), null);
  assert.equal(page.element('dashboardNextContent').hidden, true);
  assert.equal(page.redirect(), '/login');
});

test('sign-out respects unsaved changes, then uses the shared logout flow', async () => {
  const page = setup({
    api: async () => ({ permissions: { canManageTimers: true } }),
  });
  await flush();
  page.setCanLeave(false);
  await page.element('adminSignOut').listeners.click();
  assert.equal(page.signedOut(), false);
  page.setCanLeave(true);
  await page.element('adminSignOut').listeners.click();
  assert.equal(page.signedOut(), true);
  assert.equal(page.window.dashboardNext.getSession(), null);
  assert.equal(page.redirect(), '/login');
});

test('leaving through a link waits for one custom confirmation and preserves cancelled drafts', async () => {
  const page = setup({
    api: async () => ({ permissions: { canManageTimers: true } }),
  });
  await flush();
  page.setCanLeave(false);
  let resolve;
  let prompts = 0;
  page.setConfirmation((message, options) => {
    prompts += 1;
    assert.equal(message, 'admin_next_leave_unsaved');
    assert.equal(options.destructive, true);
    return new Promise((done) => {
      resolve = done;
    });
  });
  const link = {
    href: 'http://localhost/dashboard',
    target: '',
    hasAttribute: () => false,
  };
  const click = () =>
    page.documentEvents.click({
      target: { closest: () => link },
      button: 0,
      preventDefault() {},
    });
  const cancelled = click();
  await click();
  assert.equal(prompts, 1);
  assert.equal(page.redirect(), null);
  resolve(false);
  await cancelled;
  let warned = false;
  page.events.beforeunload({
    preventDefault() {
      warned = true;
    },
  });
  assert.equal(warned, true);
  const accepted = click();
  resolve(true);
  await accepted;
  assert.equal(page.redirect(), link.href);
  page.events.beforeunload({
    preventDefault() {
      assert.fail('No duplicate browser warning after confirmation');
    },
  });
});

test('sign-out waits for confirmation and does not act on a replaced session', async () => {
  const page = setup({
    api: async () => ({ permissions: { canManageTimers: true } }),
  });
  await flush();
  page.setCanLeave(false);
  let resolve;
  page.setConfirmation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = page.element('adminSignOut').listeners.click();
  assert.equal(page.signedOut(), false);
  page.events.storage({ key: 'token' });
  await flush();
  resolve(true);
  await pending;
  assert.equal(page.signedOut(), false);
  assert.equal(page.state(), 'ready');
});

test('Content admits reviewers or news managers but not unrelated administrative permissions', async () => {
  for (const permission of [
    'canReviewAndPublish',
    'canManageNews',
    'canManageEventRsvps',
    'canReadUsers',
  ]) {
    const page = setup({
      url: 'http://localhost/dashboard-next?area=content&type=event&status=pending&id=selected',
      api: async () => ({ permissions: { [permission]: true } }),
    });
    await flush();
    const allowed = ['canReviewAndPublish', 'canManageNews'].includes(
      permission,
    );
    assert.equal(page.contentMounted(), allowed ? 1 : 0);
    assert.equal(page.element('adminContentLink').hidden, !allowed);
    if (allowed) {
      assert.equal(page.contentArea().user.permissions[permission], true);
      await page.contentArea().api('/api/admin/content');
      page.contentArea().onDenied();
      assert.equal(page.contentDisposed(), 1);
      await assert.rejects(page.contentArea().api('/api/admin/content'), {
        status: 403,
      });
    }
  }
});

test('Content remains mounted between sections and its hidden edits guard page exit', async () => {
  const page = setup({
    url: 'http://localhost/dashboard-next?area=content',
    api: async () => ({
      permissions: { canManageNews: true, canReadUsers: true },
    }),
  });
  await flush();
  page.setContentDirty(true);
  page.window.location.href = 'http://localhost/dashboard-next?area=users';
  await page.events.popstate();
  assert.equal(page.contentDisposed(), 0);
  let prevented = false;
  page.events.beforeunload({
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  page.window.location.href = 'http://localhost/dashboard-next?area=content';
  await page.events.popstate();
  assert.equal(page.contentMounted(), 1);
  page.events.storage({ key: 'token' });
  await flush();
  assert.equal(page.contentDisposed(), 1);
});

test('Awards remains available to reviewers and unavailable without review permission', async () => {
  const reviewer = setup({
    api: async () => ({ permissions: { canReviewAndPublish: true } }),
    url: 'http://localhost/dashboard-next?area=awards',
  });
  await flush();
  assert.equal(
    new URL(reviewer.window.location.href).searchParams.get('area'),
    'awards',
  );
  assert.equal(reviewer.awardsMounted(), 1);
  assert.equal(reviewer.element('adminBannersLink').hidden, true);
  assert.equal(reviewer.element('adminAwardsLink').hidden, false);
  const denied = setup({
    url: 'http://localhost/dashboard-next?area=awards',
    api: async () => ({ permissions: { canManageTimers: true } }),
  });
  await flush();
  assert.equal(denied.awardsMounted(), 0);
  assert.equal(denied.element('adminAwards').hidden, true);
  assert.equal(
    denied.element('adminAreaMessage').textContent,
    'admin_next_denied_title',
  );
});

test('switching areas preserves mounted editors and hidden drafts still guard page exit', async () => {
  const page = setup({
    api: async () => ({
      permissions: { canManageTimers: true, canReviewAndPublish: true },
    }),
  });
  await flush();
  page.setCanLeave(false);
  page.window.location.href = 'http://localhost/dashboard-next?area=awards';
  await page.events.popstate();
  assert.equal(page.awardsMounted(), 1);
  assert.equal(page.element('adminBanners').hidden, true);
  page.setAwardsDirty(true);
  page.window.location.href = 'http://localhost/dashboard-next?area=banners';
  await page.events.popstate();
  assert.equal(page.mounted(), 1);
  assert.equal(page.awardsDisposed(), 0);
  page.setCanLeave(true);
  let prevented = false;
  page.events.beforeunload({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  await page.element('adminSignOut').listeners.click();
  assert.equal(page.signedOut(), false);
  page.setNavigationBusy(true);
  page.window.location.href = 'http://localhost/dashboard-next?area=awards';
  await page.events.popstate();
  assert.equal(
    new URL(page.window.location.href).searchParams.get('area'),
    'banners',
  );
});

test('an area handoff respects unsaved changes in another mounted area', async () => {
  const page = setup({
    api: async () => ({
      permissions: { canManageTimers: true, canReviewAndPublish: true },
    }),
  });
  await flush();
  page.setCanLeave(false);
  page.window.location.href = 'http://localhost/dashboard-next?area=awards';
  await page.events.popstate();
  const target = '/content-workspace?id=article';
  await page.awardsArea().navigate(target);
  assert.equal(page.redirect(), null);
  page.setConfirmation(async () => true);
  await page.awardsArea().navigate(target);
  assert.equal(page.redirect(), target);
  page.events.beforeunload({
    preventDefault() {
      assert.fail('Already confirmed leaving');
    },
  });
});

test('revoking Awards access disposes that editor without discarding Banners', async () => {
  const page = setup({
    api: async () => ({
      permissions: { canManageTimers: true, canReviewAndPublish: true },
    }),
  });
  await flush();
  page.window.location.href = 'http://localhost/dashboard-next?area=awards';
  await page.events.popstate();
  page.awardsArea().onDenied();
  assert.equal(page.awardsDisposed(), 1);
  assert.equal(page.element('adminAwardsLink').hidden, true);
  await assert.rejects(
    page.awardsArea().api('/api/admin/professional-awards'),
    { status: 403 },
  );
  page.window.location.href = 'http://localhost/dashboard-next?area=banners';
  await page.events.popstate();
  assert.equal(page.mounted(), 1);
  assert.equal(page.element('adminBanners').hidden, false);
});

test('recipient payload uses award-specific fields and archive sorting does not mutate records', () => {
  const window = {};
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/dashboard-next-awards.js'),
      'utf8',
    ),
    { window },
  );
  const values = {
    year: '2026',
    name: ' Example Name ',
    role: ' Captain ',
    medallionNumber: '12',
    amount: '$1,000',
    imageUrl: 'https://example.test/photo.webp',
  };
  const form = { elements: { namedItem: (name) => ({ value: values[name] }) } };
  const { recipientPayload, sortedRecipients } = window.DashboardNextAwards;
  const medallion = recipientPayload(form, 'colonel-in-chief-commendation');
  assert.equal(medallion.year, 2026);
  assert.equal(medallion.name, 'Example Name');
  assert.equal(medallion.medallionNumber, '12');
  assert.equal(medallion.imageUrl, '');
  assert.equal(medallion.amount, '');
  assert.equal(recipientPayload(form, 'branch-bursary').amount, '$1,000');
  assert.equal(
    recipientPayload(form, 'member-of-the-year').imageUrl,
    values.imageUrl,
  );
  const records = [
    { year: 2020, name: 'Alpha' },
    { year: 2026, name: 'Beta', medallionNumber: '12' },
  ];
  assert.equal(sortedRecipients(records)[0].name, 'Beta');
  assert.equal(records[0].name, 'Alpha');
  assert.equal(sortedRecipients(records, '2026')[0].name, 'Beta');
  assert.equal(sortedRecipients(records, 'ALPHA')[0].name, 'Alpha');
  assert.equal(sortedRecipients(records, '12')[0].name, 'Beta');
});

test('banner payload preserves bilingual fields, switches, colours, order, and local dates', () => {
  const window = {};
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/dashboard-next-banners.js'),
      'utf8',
    ),
    { window },
  );
  const values = {
    title: 'Notice',
    textEn: 'English',
    textFr: 'Français',
    color: '#123456',
    textColor: '#ffffff',
    placement: 'home',
    screenPosition: 'below-header',
    enabled: false,
    scrolling: true,
    dismissible: false,
    icon: 'info',
    scheduleEnabled: true,
    countdownEnabled: true,
    order: '3',
    startsAt: '2026-09-18T10:30',
    endsAt: '',
    countdownAt: '2026-10-01T12:00',
  };
  const result = window.DashboardNextBanners.payload({
    elements: {
      namedItem: (name) => ({ value: values[name], checked: values[name] }),
    },
  });
  assert.equal(result.text.en, 'English');
  assert.equal(result.text.fr, 'Français');
  assert.equal(result.enabled, true);
  assert.equal(result.order, 3);
  assert.equal(result.placement, 'home');
  assert.equal(result.screenPosition, 'below-header');
  assert.equal(result.color, '#123456');
  assert.equal(result.icon, 'info');
  assert.equal(result.startsAt, new Date(values.startsAt).toISOString());
  assert.equal(result.endsAt, null);
  assert.equal(result.countdownAt, new Date(values.countdownAt).toISOString());
});

test('Pages mounts once with permission and retains a guarded draft across areas', async () => {
  const page = setup({
    api: async () => ({
      permissions: { canManagePages: true, canReadUsers: true },
    }),
    url: 'http://localhost/dashboard-next?area=pages',
  });
  await flush();
  assert.equal(page.pagesMounted(), 1);
  page.setPagesDirty(true);
  page.window.location.href = 'http://localhost/dashboard-next?area=users';
  await page.events.popstate();
  let guarded = false;
  page.events.beforeunload({
    preventDefault() {
      guarded = true;
    },
  });
  assert.equal(guarded, true);
  page.window.location.href = 'http://localhost/dashboard-next?area=pages';
  await page.events.popstate();
  assert.equal(page.pagesMounted(), 1);
  assert.equal(page.pagesArea().permissions.canManagePages, true);
  const denied = setup({ url: 'http://localhost/dashboard-next?area=pages' });
  await flush();
  assert.equal(denied.pagesMounted(), 0);
});

test('Translations retains its editor across sections, guards drafts, and disposes on revoked access', async () => {
  const page = setup({
    api: async () => ({
      permissions: { canManageTranslations: true, canReadUsers: true },
    }),
    url: 'http://localhost/dashboard-next?area=translations',
  });
  await flush();
  assert.equal(page.translationsMounted(), 1);
  page.setTranslationsDirty(true);
  page.window.location.href = 'http://localhost/dashboard-next?area=users';
  await page.events.popstate();
  let guarded = false;
  page.events.beforeunload({
    preventDefault() {
      guarded = true;
    },
  });
  assert.equal(guarded, true);
  page.window.location.href =
    'http://localhost/dashboard-next?area=translations';
  await page.events.popstate();
  assert.equal(page.translationsMounted(), 1);
  page.translationsArea().onDenied();
  assert.equal(page.translationsDisposed(), 1);
  assert.equal(page.element('adminTranslations').hidden, true);
  const denied = setup({
    url: 'http://localhost/dashboard-next?area=translations',
  });
  await flush();
  assert.equal(denied.translationsMounted(), 0);
});

test('Media requires library access, mounts once across sections, and disposes on denial', async () => {
  const page = setup({
    api: async () => ({
      permissions: { canViewMediaLibrary: true, canReadUsers: true },
    }),
    url: 'http://localhost/dashboard-next?area=media',
  });
  await flush();
  assert.equal(page.mediaMounted(), 1);
  page.window.location.href = 'http://localhost/dashboard-next?area=users';
  await page.events.popstate();
  page.window.location.href = 'http://localhost/dashboard-next?area=media';
  await page.events.popstate();
  assert.equal(page.mediaMounted(), 1);
  page.mediaArea().onDenied();
  assert.equal(page.mediaDisposed(), 1);
  assert.equal(page.element('adminMedia').hidden, true);
  const denied = setup({
    api: async () => ({ permissions: { canUploadMedia: true } }),
    url: 'http://localhost/dashboard-next?area=media',
  });
  await flush();
  assert.equal(denied.mediaMounted(), 0);
});

test('Certificates mounts only with fulfillment permission, persists across sections, and disposes on denial', async () => {
  const page = setup({
    api: async () => ({
      permissions: { canManageCertificateRequests: true, canReadUsers: true },
    }),
    url: 'http://localhost/dashboard-next?area=certificates',
  });
  await flush();
  assert.equal(page.certificatesMounted(), 1);
  page.window.location.href = 'http://localhost/dashboard-next?area=users';
  await page.events.popstate();
  page.window.location.href =
    'http://localhost/dashboard-next?area=certificates';
  await page.events.popstate();
  assert.equal(page.certificatesMounted(), 1);
  page.certificatesArea().onDenied();
  assert.equal(page.certificatesDisposed(), 1);
  assert.equal(page.element('adminCertificates').hidden, true);
  const denied = setup({
    api: async () => ({ permissions: { canReviewAndPublish: true } }),
    url: 'http://localhost/dashboard-next?area=certificates',
  });
  await flush();
  assert.equal(denied.certificatesMounted(), 0);
});

test('Analytics is permission gated, persists across sections, and disposes on denial', async () => {
  const page = setup({
    api: async () => ({
      permissions: { canViewAnalytics: true, canReadUsers: true },
    }),
    url: 'http://localhost/dashboard-next?area=analytics',
  });
  await flush();
  assert.equal(page.analyticsMounted(), 1);
  page.window.location.href = 'http://localhost/dashboard-next?area=users';
  await page.events.popstate();
  page.window.location.href = 'http://localhost/dashboard-next?area=analytics';
  await page.events.popstate();
  assert.equal(page.analyticsMounted(), 1);
  page.analyticsArea().onDenied();
  assert.equal(page.analyticsDisposed(), 1);
  const denied = setup({
    url: 'http://localhost/dashboard-next?area=analytics',
  });
  await flush();
  assert.equal(denied.analyticsMounted(), 0);
});

test('Audit requires its own permission, mounts once, and disposes on denial', async () => {
  const page = setup({
    api: async () => ({
      permissions: { canViewAuditLog: true, canReadUsers: true },
    }),
    url: 'http://localhost/dashboard-next?area=audit',
  });
  await flush();
  assert.equal(page.auditMounted(), 1);
  page.window.location.href = 'http://localhost/dashboard-next?area=users';
  await page.events.popstate();
  page.window.location.href = 'http://localhost/dashboard-next?area=audit';
  await page.events.popstate();
  assert.equal(page.auditMounted(), 1);
  page.auditArea().onDenied();
  assert.equal(page.auditDisposed(), 1);
  const denied = setup({ url: 'http://localhost/dashboard-next?area=audit' });
  await flush();
  assert.equal(denied.auditMounted(), 0);
});
