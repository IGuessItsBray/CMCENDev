const legalPage = document.querySelector('[data-legal-page]');

const copy = {
  privacy: {
    en: {
      title: 'Privacy Policy',
      intro: 'Effective September 1, 2026 · Last updated August 24, 2026',
      sections: [
        ['Who we are', 'The Communications & Electronics Association operates CMCEN / RCMCE. This policy explains how we collect, use, disclose, protect, retain, and handle personal information in accordance with PIPEDA.'],
        ['Information we collect', 'We collect account and profile details, authentication and security records, submitted content and correspondence, uploaded images and files, consent records, and technical usage data such as IP address, page and referral information, browser/device data, and audit records.'],
        ['How we use it', 'We use information to operate and secure the site, administer accounts, review and publish submissions, communicate with you, meet legal obligations, investigate misuse, and improve the site. Public submissions may be displayed on the site and shared through CMCEN channels where the submission process says so.'],
        ['Service providers and location', 'The CMCEN website, databases, backups, media/CDN, and logging are hosted by Contabo on a VPS in US Central (St. Louis). Email is delivered using Google’s main SMTP service. These providers may process information on our behalf.'],
        ['Consent, cookies, and email', 'We obtain consent where required. Essential cookies support secure sign-in; browser storage may remember preferences. We do not use behavioural advertising. Optional email subscriptions require separate express consent and include an unsubscribe mechanism.'],
        ['Retention and safeguards', 'We retain information only as long as reasonably necessary for the stated purposes, security, legal obligations, disputes, and records. We use access controls, MFA, moderation, logging, and appropriate technical and organizational safeguards.'],
        ['Your choices and requests', 'You may request access, correction, withdrawal of consent, account closure, or removal of your personal information from public content, subject to legal limits and identity verification. We respond within applicable legal timeframes.'],
        ['Contact and complaints', 'For privacy requests or concerns, email privacy@cmcen.ca. You may also complain to the Office of the Privacy Commissioner of Canada. For legal notices, email legal@cmcen.ca.'],
      ],
    },
    fr: {
      title: 'Politique de confidentialité',
      intro: 'En vigueur le 1er septembre 2026 · Dernière mise à jour le 24 août 2026',
      sections: [
        ['Qui sommes-nous', 'L’Association des communications et de l’électronique exploite CMCEN / RCMCE. Cette politique explique comment nous recueillons, utilisons, communiquons, protégeons, conservons et traitons les renseignements personnels conformément à la LPRPDE.'],
        ['Renseignements recueillis', 'Nous recueillons les détails de compte et de profil, les dossiers d’authentification et de sécurité, le contenu et la correspondance soumis, les images et fichiers téléversés, les dossiers de consentement et les données techniques d’utilisation.'],
        ['Utilisation', 'Nous utilisons ces renseignements pour exploiter et sécuriser le site, administrer les comptes, examiner et publier les soumissions, communiquer avec vous, respecter nos obligations et améliorer le site.'],
        ['Fournisseurs et emplacement', 'Le site CMCEN, ses bases de données, sauvegardes, médias/CDN et journaux sont hébergés par Contabo sur un VPS dans le centre des États-Unis (St. Louis). Les courriels sont transmis par le service SMTP principal de Google.'],
        ['Consentement, témoins et courriel', 'Nous obtenons le consentement lorsque requis. Les témoins essentiels permettent une connexion sécurisée; le stockage du navigateur peut mémoriser vos préférences. Nous n’utilisons pas de publicité comportementale.'],
        ['Conservation et protection', 'Nous conservons les renseignements seulement pendant la période raisonnablement nécessaire et appliquons des contrôles d’accès, l’AMF, la modération et des mesures de protection appropriées.'],
        ['Vos choix et demandes', 'Vous pouvez demander l’accès, la correction, le retrait du consentement, la fermeture de votre compte ou le retrait de renseignements personnels publics, sous réserve des limites légales et de la vérification de votre identité.'],
        ['Contact et plaintes', 'Pour toute demande ou préoccupation liée à la vie privée, écrivez à privacy@cmcen.ca. Pour les avis juridiques, écrivez à legal@cmcen.ca. Vous pouvez aussi porter plainte auprès du Commissariat à la protection de la vie privée du Canada.'],
      ],
    },
  },
  terms: {
    en: {
      title: 'Terms of Service',
      intro: 'Effective September 1, 2026 · Last updated August 24, 2026',
      sections: [
        ['Acceptance and purpose', 'By using CMCEN / RCMCE, creating an account, or submitting content, you agree to these Terms and the Privacy Policy. The Communications & Electronics Association provides this community and information service.'],
        ['Acceptable use', 'Do not submit classified, protected, controlled, operationally sensitive, deployment-related, or unauthorized information. Do not use the site for emergencies or official Government of Canada, CAF, or DND communications.'],
        ['Accounts', 'You must provide accurate information, safeguard your credentials and MFA methods, and promptly report suspected unauthorized access. Accounts are personal and may not be shared, sold, or transferred.'],
        ['Submissions and publication', 'You remain responsible for content you submit and must have all required rights, authority, permissions, and consents. CMCEN may review, edit for clarity or accessibility, reject, restrict, remove, or publish content. Public content may be indexed, copied, or shared outside our control.'],
        ['Licence and intellectual property', 'You grant the Association a non-exclusive, worldwide, royalty-free licence to host, review, format, translate, publish, distribute, preserve, and communicate submitted content for the site and its community mission.'],
        ['Disclaimers and liability', 'The service is provided as is and as available, to the extent allowed by law. Content may change and should be confirmed with the responsible organization or official source. Nothing excludes rights that cannot lawfully be excluded.'],
        ['Suspension, changes, and law', 'We may suspend access or remove content to protect users, the service, or the public. These Terms are governed by the laws of Ontario and the applicable federal laws of Canada, and disputes are subject to the courts of Ontario unless applicable law requires otherwise.'],
        ['Contact', 'For Terms, account-closure, copyright, or legal requests, email legal@cmcen.ca. Privacy requests must be sent to privacy@cmcen.ca.'],
      ],
    },
    fr: {
      title: 'Conditions d’utilisation',
      intro: 'En vigueur le 1er septembre 2026 · Dernière mise à jour le 24 août 2026',
      sections: [
        ['Acceptation et objet', 'En utilisant CMCEN / RCMCE, en créant un compte ou en soumettant du contenu, vous acceptez les présentes conditions et la Politique de confidentialité. L’Association des communications et de l’électronique fournit ce service communautaire et d’information.'],
        ['Utilisation acceptable', 'Ne soumettez pas de renseignements classifiés, protégés, contrôlés, opérationnellement sensibles, liés aux déploiements ou non autorisés. N’utilisez pas le site pour les urgences ou les communications officielles du gouvernement du Canada, des FAC ou du MDN.'],
        ['Comptes', 'Vous devez fournir des renseignements exacts, protéger vos identifiants et vos méthodes d’AMF, et signaler rapidement tout accès non autorisé présumé. Les comptes sont personnels.'],
        ['Soumissions et publication', 'Vous demeurez responsable du contenu soumis et devez détenir les droits, l’autorité, les permissions et les consentements requis. CMCEN peut examiner, modifier, refuser, restreindre, retirer ou publier le contenu.'],
        ['Licence et propriété intellectuelle', 'Vous accordez à l’Association une licence non exclusive, mondiale et libre de redevances pour héberger, examiner, mettre en forme, traduire, publier, distribuer, préserver et communiquer le contenu soumis.'],
        ['Avis de non-responsabilité', 'Le service est fourni tel quel et selon sa disponibilité, dans la mesure permise par la loi. Vérifiez les renseignements importants auprès de la source officielle.'],
        ['Suspension, modifications et droit applicable', 'Nous pouvons suspendre l’accès ou retirer du contenu pour protéger les utilisateurs, le service ou le public. Les présentes conditions sont régies par les lois de l’Ontario et les lois fédérales applicables du Canada.'],
        ['Contact', 'Pour les demandes liées aux conditions, à la fermeture de compte, au droit d’auteur ou aux questions juridiques, écrivez à legal@cmcen.ca. Les demandes de confidentialité doivent être envoyées à privacy@cmcen.ca.'],
      ],
    },
  },
};

function renderLegalPage() {
  if (!legalPage) return;
  const type = legalPage.dataset.legalPage;
  const language = document.documentElement.lang === 'fr' ? 'fr' : 'en';
  const content = copy[type][language];
  document.title = `${content.title} | CMCEN / RCMCE`;
  legalPage.replaceChildren();
  const heading = document.createElement('header');
  heading.innerHTML = `<p class="register-eyebrow">CMCEN / RCMCE</p><h1>${content.title}</h1><p>${content.intro}</p>`;
  legalPage.append(heading);
  content.sections.forEach(([title, body]) => {
    const section = document.createElement('section');
    section.innerHTML = `<h2>${title}</h2><p>${body}</p>`;
    legalPage.append(section);
  });
}

renderLegalPage();
document.addEventListener('languagechange', renderLegalPage);
