const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
const translations = require('../data/translations.json');
const { FAMILY_WORDING_OPTIONS } = require('../config/certificate-wording');
const {
  getCleanCertificateRequestPayload,
  validateCertificateRequestPayload,
} = require('../services/certificate-requests');

// Run the actual public family-card functions without authentication/network
// bootstrap. The DOM boundary models only browser operations these cards use.
class CardElement extends Element {
  matches(selector) {
    const data = selector.match(/^\[data-([a-z-]+)\]$/u);
    if (data)
      return Object.hasOwn(
        this.dataset,
        data[1].replace(/-([a-z])/gu, (_, c) => c.toUpperCase()),
      );
    return super.matches(selector);
  }
  get options() {
    return this.children.filter((child) => child.tagName === 'OPTION');
  }
  get selectedOptions() {
    return this.options.filter((option) => option.value === this.value);
  }
}
function form() {
  const source = fs.readFileSync(
    path.join(__dirname, '../public/submit-retirement.js'),
    'utf8',
  );
  const list = new CardElement('div');
  const fields = { certificateMemberFullName: 'Alex Tremblay' };
  let language = 'en';
  const context = {
    certificateFamilyList: list,
    certificateFamilyMemberSequence: 0,
    certificateMemberFullName: {
      get value() {
        return fields.certificateMemberFullName;
      },
    },
    document: {
      createElement: (tag) => new CardElement(tag),
      createTextNode: (text) =>
        Object.assign(new CardElement('text'), { textContent: text }),
      getElementById: () => ({ checked: false }),
    },
    getFieldValue: (key) => fields[key] || '',
    isCertificateRequestActive: () => true,
    getRetirementLanguage: () => language,
    translate: (key, values = {}) =>
      Object.entries(values).reduce(
        (text, [k, v]) => text.replaceAll(`{${k}}`, v),
        translations[language][key] || key,
      ),
    certificateRequestDetails: { querySelectorAll: () => [{ value: 'CD' }] },
  };
  vm.createContext(context);
  vm.runInContext(
    source.slice(
      source.indexOf('const CERTIFICATE_FAMILY_RELATIONSHIPS'),
      source.indexOf('function renderRetirementDeleteAction'),
    ),
    context,
  );
  for (const name of [
    'getCertificateRetireeName',
    'updateCertificateFamilyCardContext',
    'updateCertificateFamilyOtherField',
    'updateCertificateFamilyCardLanguage',
    'updateCertificateFamilyCards',
    'createCertificateFamilyMemberCard',
    'buildCertificateRequestData',
  ]) {
    const start = source.indexOf(`function ${name}(`);
    const end = source.indexOf('\nfunction ', start + 1);
    vm.runInContext(source.slice(start, end), context);
  }
  return {
    context,
    list,
    fields,
    setLanguage: (value) => {
      language = value;
      context.updateCertificateFamilyCards();
    },
  };
}

test('requester cards keep relationship directions separate, update named bilingual questions and serialize answers', async () => {
  const page = form();
  const card = page.context.createCertificateFamilyMemberCard();
  page.list.append(card);
  const recipient = card.querySelector('[data-certificate-family-full-name]');
  recipient.value = 'Camille Bélanger';
  await recipient.fire('input');
  const answer = card.querySelector('[data-certificate-member-relationship]');
  const relation = card.querySelector('[data-certificate-family-relationship]');
  assert.equal(answer.required, true);
  assert.equal(answer.value, '');
  assert.deepEqual(
    answer.options.slice(1).map((option) => option.value),
    FAMILY_WORDING_OPTIONS.map((option) => option.key),
  );
  assert.match(
    card.querySelector('[data-certificate-member-relationship-label]')
      .textContent,
    /Camille Bélanger.*Alex Tremblay.*Camille Bélanger/u,
  );
  relation.value = 'mother';
  answer.value = 'daughter';
  const payload = page.context.buildCertificateRequestData();
  assert.equal(payload.familyMembers[0].relationship, 'mother');
  assert.equal(
    payload.familyMembers[0].memberRelationshipToRecipient,
    'daughter',
  );
  assert.equal(payload.familyMembers[0].fullName, 'Camille Bélanger');
  page.fields.certificateMemberFullName = 'Émilie D’Amour';
  page.setLanguage('fr');
  assert.match(
    card.querySelector('[data-certificate-member-relationship-label]')
      .textContent,
    /Camille Bélanger.*Émilie D’Amour/u,
  );
  assert.equal(answer.value, 'daughter');
  assert.equal(
    answer.options.find((option) => option.value === 'daughter').textContent,
    'Sa fille',
  );
  assert.equal(relation.value, 'mother');
  const second = page.context.createCertificateFamilyMemberCard();
  page.list.append(second);
  assert.equal(
    second.querySelector('[data-certificate-member-relationship]').value,
    '',
  );
});

function payload(answer) {
  return {
    member: {
      fullName: 'Alex',
      rankLanguage: 'en',
      decorations: ['CD'],
      lastUnit: 'Unit',
      ceBranchEnrollmentDate: '2000-01-01',
      releaseDate: '2026-08-01',
      neededByDate: '2026-07-01',
      dwdParadeRequested: false,
    },
    familyMembers: [
      {
        relationship: 'mother',
        fullName: 'Camille',
        memberRelationshipToRecipient: answer,
      },
    ],
    mailingAddress: {
      line1: 'Address',
      line2: 'Unit2',
      city: 'Ottawa',
      province: 'ON',
      postalCode: 'K1A 0A1',
      country: 'Canada',
    },
  };
}
test('new request validation requires a supported explicit answer and never derives it from recipient relationship', () => {
  for (const variant of FAMILY_WORDING_OPTIONS) {
    const clean = getCleanCertificateRequestPayload(
      payload(` ${variant.key} `),
    );
    assert.equal(validateCertificateRequestPayload(clean), '');
    assert.equal(
      clean.familyMembers[0].memberRelationshipToRecipient,
      variant.key,
    );
    assert.equal(clean.familyMembers[0].relationship, 'mother');
  }
  for (const answer of [undefined, '', 'other', 'member_name', 'guess'])
    assert.match(
      validateCertificateRequestPayload(
        getCleanCertificateRequestPayload(payload(answer)),
      ),
      /retiring member.*related/u,
    );
});
