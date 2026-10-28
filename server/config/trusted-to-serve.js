// Award claims transcribed from the supplied bilingual PPTX, SHA-256
// 6658f4f75531f48d21217e2566aa4bfa2e0062afe799ae7ed94db101ba4601dd.
// Only recipient, rank, date and explicitly reviewed grammatical variants vary.
const BODY_EN =
  'Presented to {recipientEn} in recognition of exceptional leadership, teamwork, and dedication to the values of the Canadian Armed Forces. {recipientEn} embodies the principles of "Trusted to Serve" through their unwavering integrity, loyalty, and courage. They demonstrate a strong sense of initiative and resilience, reflecting the "Fighting Spirit" that defines our team. Through their actions and attitude, {recipientEn} has fostered a sense of Esprit de Corps, inspiring their peers to work together towards common goals. Their commitment to excellence and willingness to empower others at all levels has earned them the trust and respect of their instructors and fellow students. This award acknowledges {recipientEn}’s outstanding contributions to our C&E Branch community and their potential to become a future leader in the Canadian Armed Forces, Communications and Electronics Branch. Congratulations!';
const BODY_FR =
  'En reconnaissance de son leadership exceptionnel, de son esprit d’équipe et de son dévouement aux valeurs des Forces armées canadiennes. {recipientFr} incarne les principes de "Servir avec honneur" grâce à son intégrité, sa loyauté et son courage indéfectibles. {pronoun} démontre un fort sens de l’initiative et de la résilience, reflétant l’Esprit Combatif qui définit notre équipe. Par ses actions et son attitude, {recipientFr} a favorisé un sentiment d’Esprit de Corps, inspirant ses pairs à travailler ensemble vers des objectifs communs. Son engagement envers l’excellence et sa volonté de soutenir les autres à tous les niveaux lui ont valu la confiance et le respect de ses instructeurs et de ses camarades. Cette distinction souligne les contributions remarquables {contributionRecipient} à notre communauté de la Branche des communications et de l’électronique et met en avant son potentiel à devenir {futureLeader} au sein des Forces armées canadiennes. Félicitations!';
const FR_GRAMMAR = Object.freeze({
  masculine: { dedication: 'au ', contribution: 'du ' },
  feminine: { dedication: 'à la ', contribution: 'de la ' },
  elided: { dedication: 'à l’', contribution: 'de l’' },
  no_article: { dedication: 'à ', contribution: 'de ' },
});
module.exports = { BODY_EN, BODY_FR, FR_GRAMMAR };
