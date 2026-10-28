const fs = require('node:fs/promises');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const {
  MEMBER_TEMPLATE_PATH,
  getMemberCertificateData,
  fillMemberCertificate,
  FAMILY_TEMPLATE_PATH,
  getFamilyCertificateData,
  fillFamilyCertificate,
} = require('../../services/certificate-documents');

function memberRequest(overrides = {}) {
  return {
    certificateType: 'retirement',
    member: {
      fullName: 'Émilie Anne-Marie D’Amour',
      rank: 'Warrant Officer',
      rankLanguage: 'fr',
      decorations: ['CD', 'MMM'],
      ceBranchEnrollmentDate: '2000-02-29',
      releaseDate: new Date('2026-08-01T00:00:00.000Z'),
      ...overrides,
    },
  };
}

// Deliberately different standard fonts. Test output proves mechanics only.
// It never passes the production font loader and must not be used for printing.
async function syntheticMemberPdf(request = memberRequest()) {
  const document = await PDFDocument.load(
    await fs.readFile(MEMBER_TEMPLATE_PATH),
  );
  return fillMemberCertificate(document, getMemberCertificateData(request), {
    name: await document.embedFont(StandardFonts.Helvetica),
    dates: await document.embedFont(StandardFonts.TimesRomanBold),
  });
}

function familyRequest() {
  return {
    ...memberRequest({ fullName: 'Alex Tremblay' }),
    familyMembers: [
      {
        fullName: 'Camille Bélanger',
        relationship: 'wife',
        memberRelationshipToRecipient: 'husband',
      },
      {
        fullName: 'Émilie Anne-Marie Catherine Alexandra D’Amour-Lévesque',
        relationship: 'guardian',
        memberRelationshipToRecipient: 'daughter',
      },
    ],
  };
}

async function syntheticFamilyPdf(
  request = familyRequest(),
  index = 0,
  options = {},
) {
  const document = await PDFDocument.load(
    await fs.readFile(FAMILY_TEMPLATE_PATH),
  );
  return fillFamilyCertificate(
    document,
    getFamilyCertificateData(request, index, options),
    {
      name: await document.embedFont(StandardFonts.Helvetica),
      wording: await document.embedFont(StandardFonts.TimesRomanItalic),
      date: await document.embedFont(StandardFonts.TimesRoman),
    },
  );
}

module.exports = {
  memberRequest,
  syntheticMemberPdf,
  familyRequest,
  syntheticFamilyPdf,
};
