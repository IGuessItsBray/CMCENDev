// Award claims transcribed from the supplied bilingual PPTX, SHA-256
// 6658f4f75531f48d21217e2566aa4bfa2e0062afe799ae7ed94db101ba4601dd.
// Student wording is unchanged; instructor wording was supplied separately.
const BODY_EN =
  'Presented to {recipientEn} in recognition of exceptional leadership, teamwork, and dedication to the values of the Canadian Armed Forces. {recipientEn} embodies the principles of "Trusted to Serve" through their unwavering integrity, loyalty, and courage. They demonstrate a strong sense of initiative and resilience, reflecting the "Fighting Spirit" that defines our team. Through their actions and attitude, {recipientEn} has fostered a sense of Esprit de Corps, inspiring their peers to work together towards common goals. Their commitment to excellence and willingness to empower others at all levels has earned them the trust and respect of their instructors and fellow students. This award acknowledges {recipientEn}’s outstanding contributions to our C&E Branch community and their potential to become a future leader in the Canadian Armed Forces, Communications and Electronics Branch. Congratulations!';
const BODY_FR =
  'En reconnaissance de son leadership exceptionnel, de son esprit d’équipe et de son dévouement aux valeurs des Forces armées canadiennes. {recipientFr} incarne les principes de "Servir avec honneur" grâce à son intégrité, sa loyauté et son courage indéfectibles. {pronoun} démontre un fort sens de l’initiative et de la résilience, reflétant l’Esprit Combatif qui définit notre équipe. Par ses actions et son attitude, {recipientFr} a favorisé un sentiment d’Esprit de Corps, inspirant ses pairs à travailler ensemble vers des objectifs communs. Son engagement envers l’excellence et sa volonté de soutenir les autres à tous les niveaux lui ont valu la confiance et le respect de ses instructeurs et de ses camarades. Cette distinction souligne les contributions remarquables {contributionRecipient} à notre communauté de la Branche des communications et de l’électronique et met en avant son potentiel à devenir {futureLeader} au sein des Forces armées canadiennes. Félicitations!';
const INSTRUCTOR_BODY_EN =
  '{recipientEn} exemplifies the principles of “Trusted to Serve” through their unwavering integrity, professionalism, and commitment to developing future communicators. Their initiative, resilience, and strong work ethic reflect the “Fighting Spirit” that inspires both colleagues and students alike. Through their mentorship, guidance, and positive example, {recipientEn} has fostered a strong sense of Esprit de Corps within the training environment. Their ability to empower learners, promote teamwork, and uphold high standards has earned them the trust and respect of both staff and students. This award acknowledges {recipientEn}’s outstanding contributions to the C&E Branch training community and their continued commitment to excellence within the Canadian Armed Forces, Communications and Electronics Branch. Congratulations!';
const INSTRUCTOR_BODY_FR =
  "{instructorSubjectFr} incarne les principes de « Trusted to Serve » (digne de confiance pour servir) par son intégrité inébranlable, son professionnalisme et son engagement à former les futurs communicateurs. Son initiative, sa résilience et sa solide éthique de travail reflètent l'« esprit combatif » qui inspire tant ses collègues que ses étudiants. Grâce à son mentorat, ses conseils et son exemple positif, {instructorRecipientFr} a favorisé un fort esprit de corps au sein de l'environnement de formation. Sa capacité à responsabiliser les apprenants, à promouvoir le travail d'équipe et à maintenir des normes élevées lui a valu la confiance et le respect du personnel et des étudiants. Ce prix récompense la contribution exceptionnelle {instructorContributionFr} à la communauté de formation de la Direction des communications et de l'électronique et son engagement continu envers l'excellence au sein des Forces armées canadiennes, Direction des communications et de l'électronique. Félicitations!";
const AWARD_ROLES = Object.freeze(['student', 'instructor']);
const FR_GRAMMAR = Object.freeze({
  masculine: { dedication: 'au ', contribution: 'du ', article: 'le ' },
  feminine: { dedication: 'à la ', contribution: 'de la ', article: 'la ' },
  elided: { dedication: 'à l’', contribution: 'de l’', article: 'l’' },
});
module.exports = {
  BODY_EN,
  BODY_FR,
  INSTRUCTOR_BODY_EN,
  INSTRUCTOR_BODY_FR,
  AWARD_ROLES,
  FR_GRAMMAR,
};
