const ProfessionalAward = require('../models/ProfessionalAward');

const LEGACY_AWARDS = Object.freeze([
  {
    slug: 'colonel-in-chief-commendation',
    title: 'Colonel-in-Chief Commendation',
    sortOrder: 1,
    summary:
      'The highest award the C&E Family may bestow. It recognizes individuals or groups for exceptional service, selfless dedication, and a lasting contribution to the objectives of the C&E Branch and its wider family.',
    eligibility:
      'All members of the C&E Family—including military, civilian, honorary appointments, retired personnel, immediate family members, units, and sections—are eligible. Collective nominations are welcome.',
    applicationDetails:
      'The award is presented during C&E Week in the late-October timeframe. The Branch Adjutant coordinates the certificate and nomination process.',
    deadline: 'End of June for the current year.',
    links: [
      {
        label: 'Colonel-in-Chief Commendation – Instruction',
        kind: 'instruction',
        url: 'https://cmcen-rcmce.ca/wp-content/uploads/00-Col-in-Chief-Commendation-Instruction-1.pdf',
      },
      {
        label: 'Colonel-in-Chief Commendation – Nomination Letter Template',
        kind: 'nomination',
        url: 'https://cmcen-rcmce.ca/wp-content/uploads/01-Col-in-Chief-Commendation-Nomination-Letter-1.docx',
      },
    ],
  },
  {
    slug: 'branch-commendation',
    title: 'C&E Branch Commendation',
    sortOrder: 2,
    summary:
      'Recognizes an individual or collective act or achievement that brings great credit to the C&E Family, including volunteerism, event planning, ceremonial roles, community involvement, veteran support, civic duties, or long service.',
    eligibility:
      'All members of the C&E Family—including military, civilian, honorary appointments, retired members, immediate family members, units, and sections—are eligible.',
    applicationDetails:
      'The Branch Leadership aims to recognize worthy recipients as close to the act or achievement as practical.',
    deadline: 'No structured submission timeline.',
    links: [
      {
        label: 'Branch Commendation – Instruction',
        kind: 'instruction',
        url: 'https://cmcen-rcmce.ca/wp-content/uploads/00-CE-Branch-Commendation-Instruction-1.pdf',
      },
      {
        label: 'Branch Commendation – Nomination Form (DND 4033-E)',
        kind: 'nomination',
        url: 'https://cmcen-rcmce.ca/wp-content/uploads/01-CE-Branch-Commendation-DND-4033-E.pdf',
      },
    ],
  },
  {
    slug: 'subaltern-of-the-year',
    title: 'Subaltern of the Year',
    sortOrder: 3,
    summary:
      'Recognizes the top C&E Branch subaltern whose duty, dedication, leadership, and professional bearing enabled exemplary Command and Control capabilities for the Canadian Armed Forces.',
    eligibility:
      'C&E Branch officers holding Lieutenant or Second Lieutenant rank. A Captain may be nominated when they served as a Lieutenant in the reporting period; only subaltern service is considered.',
    applicationDetails:
      'Three nominations are considered, channelled through Director RCCS or Strategic A6, as appropriate.',
    deadline:
      'Current dates and submission contacts are maintained in the instruction.',
    links: [
      {
        label: 'C&E Branch Subaltern of the Year – Instruction – 2025',
        kind: 'instruction',
        url: 'https://cmcen-rcmce.ca/mp-files/ce-branch-subaltern-of-the-year-instruction-2025.pdf/',
      },
      {
        label: 'C&E Branch Subaltern of the Year – Nomination Letter',
        kind: 'nomination',
        url: 'https://cmcen-rcmce.ca/wp-content/uploads/2023/05/02-CE-Branch-Subaltern-of-the-Year-Nomination-Letter.docx',
      },
    ],
    recipients: [
      {
        year: 2025,
        name: 'Lieutenant Emerich Kovacs',
        role: 'Signals Officer',
        featured: true,
      },
      { year: 2024, name: 'Captain Saad Khattak' },
      { year: 2023, name: 'Lieutenant Inga Hammers' },
      { year: 2022, name: 'Captain T. Curran' },
      { year: 2021, name: '2nd Lieutenant Kristina Kacmarova' },
      { year: 2020, name: 'Captain Garrett McDonald' },
      { year: 2019, name: 'Captain Matthias Bowles' },
      { year: 2018, name: 'Lieutenant Tristan Archambault' },
      { year: 2017, name: 'Lieutenant Kyle McLaughlin' },
      { year: 2016, name: 'Captain Kathryn Bowen' },
      { year: 2015, name: 'Captain Alex Kisielius' },
      { year: 2014, name: 'Lieutenant Gayle Motycka' },
      { year: 2013, name: 'Lieutenant Jason Kauenhofen' },
      { year: 2012, name: 'Lieutenant Christopher Vernon' },
    ],
  },
  {
    slug: 'member-of-the-year',
    title: 'Member of the Year',
    sortOrder: 4,
    summary:
      'Recognizes the top C&E Branch junior-ranking NCM whose duty, dedication, and professional bearing brought great credit to the Branch and enabled exemplary Command and Control capabilities.',
    eligibility:
      'C&E Branch NCMs from MCpl/MS downward (or equivalent). A Sergeant/PO2 may be nominated when they served as MCpl/MS in the reporting period; only junior-NCO service is considered.',
    applicationDetails:
      'Eight nominations are channelled through the applicable occupational advisors for RCCS, ATIS Tech, Cyber Op, and SIGINT Spec.',
    deadline:
      'Current dates and submission contacts are maintained in the instruction.',
    links: [
      {
        label: 'C&E Branch Member of the Year – Instruction – 2025',
        kind: 'instruction',
        url: 'https://cmcen-rcmce.ca/mp-files/ce-branch-member-of-the-year-instruction-2025.pdf/',
      },
      {
        label: 'C&E Branch Member of the Year – Nomination Letter',
        kind: 'nomination',
        url: 'https://cmcen-rcmce.ca/wp-content/uploads/2023/05/02-CE-Branch-Member-of-the-Year-Nomination-Letter.docx',
      },
    ],
    recipients: [
      {
        year: 2025,
        name: 'Master Corporal Stephen Mak',
        role: 'Signal Operator',
        featured: true,
      },
      { year: 2024, name: 'Sergeant Jérémie Choquette' },
      { year: 2023, name: 'Corporal Christian Glass' },
      { year: 2022, name: 'Corporal Patrick Kerr' },
      { year: 2021, name: 'Master Corporal Emily Bradley' },
      { year: 2020, name: 'Master Corporal Joshua Townsend' },
      { year: 2019, name: 'Master Corporal Justin Barfoot' },
      { year: 2018, name: 'Master Corporal Mike Bauml' },
      { year: 2017, name: 'Master Corporal James Nicholls' },
      { year: 2016, name: 'Corporal Jason O’Hearon' },
      { year: 2015, name: 'Corporal Mark Flood' },
      { year: 2014, name: 'Master Corporal Jean-Sebastien Vallée' },
      { year: 2013, name: 'Master Corporal Martin Mailloux' },
      { year: 2012, name: 'Master Corporal Sebastien St-Gelais' },
      { year: 2011, name: 'Corporal Roch Grenier' },
      { year: 2010, name: 'Corporal Jason Daniels' },
      { year: 2009, name: 'Master Corporal Paul Hunt' },
      { year: 2008, name: 'Master Corporal Patrick Rule' },
      { year: 2007, name: 'Master Corporal Jonathan L’Italien' },
      { year: 2006, name: 'Master Corporal Reynold Dyck' },
    ],
  },
  {
    slug: 'heritage-awards',
    title: 'Heritage Awards',
    sortOrder: 5,
    summary:
      'Recognizes individuals, teams, and organizations that make a noteworthy contribution to preserving, educating about, and celebrating Canada’s Military C&E Heritage.',
    eligibility:
      'Any individual, team, or organization may be nominated when the contribution to C&E heritage is national in reach and broad in scope.',
    applicationDetails:
      'Categories include Heritage Service Recognition, Collective Heritage Award, and Individual Heritage Awards (Lifetime Achievement, Honour, and Merit).',
    deadline:
      'Individual and collective nominations are due no later than 15 July of the current year.',
    links: [
      {
        label: 'Heritage Awards – Instruction',
        kind: 'instruction',
        url: 'https://cmcen-rcmce.ca/wp-content/uploads/2023/05/01-Heritage-Awards-Instruction.pdf',
      },
      {
        label: 'Heritage Awards – Application',
        kind: 'application',
        url: 'https://cmcen-rcmce.ca/wp-content/uploads/2023/05/02-Heritage-Awards-Application.docx',
      },
    ],
  },
]);

function parseLegacyRecipients(
  rows,
  { medallion = false, amount = false } = {},
) {
  return rows
    .trim()
    .split('\n')
    .map((row) => {
      const [year, first, second] = row.split('|');
      return {
        year: Number(year),
        name: medallion || amount ? second : first,
        ...(medallion ? { medallionNumber: first } : {}),
        ...(amount ? { amount: first } : {}),
      };
    });
}

const LEGACY_ARCHIVES = Object.freeze({
  'heritage-awards':
    parseLegacyRecipients(`2025|Honourable Colonel (Ret) Ken Lloyd – Lifetime Achievement
2025|Lieutenant-Colonel (Ret) Jack Lee – Lifetime Achievement
2025|Warrant Officer (Ret) David Berry – Individual (Honour)
2025|Lieutenant-Commander (Ret) Ray Lebeau – Individual (Honour)
2025|Sergeant Wayne McKay – Individual (Merit)
2021|Master Warrant Officer J.J.P (Pierre) Plante, CD (Ret'd) - Individual (Honour)
2021|Lieutenant R.M. (Richard) Gilbert, CD - Individual (Merit)
2020|Chief Warrant Officer Maynard Whitlaw, CD (Retired) – Individual (Honour)
2020|Chief Petty Officer 1st Class Wayne R. Moore, MMM, CD (Retired) – Individual (Honour)
2020|Lieutenant-Colonel Mervyn Embury, CD (Retired) – Lifetime Achievement
2019|Captain Gregory C. Parent, CD – Individual (Merit)
2019|Warrant Officer Peter G. Nordstrom, CD – Individual (Honour)
2019|Sergeant Bill Murphy, CD (Retired) – Lifetime Achievement
2018|Canadian Forces Joint Signal Regiment History Section – Collective
2018|Canadian Forces Crypto Maintenance Squadron Heritage Team – Collective
2018|Warrant Officer Robert L. Wortman, CD (Retired) – Individual (Honour)
2018|Lieutenant-Commander George T. Fraser, OMM, CD (Posthumous) – Individual (Honour)
2018|Wendy M. Stewart – Individual (Honour)
2018|Master Corporal Dennis Stow, CD (Retired) – Lifetime Achievement
2018|Lieutenant-Colonel Lloyd J. Tien, CD (Retired) – Lifetime Achievement
2017|Master Warrant Officer J. Troyanek, CD (Retired) – Individual (Merit)
2017|Lieutenant-Colonel Robert Taylor, CD (Retired) – Individual (Merit)
2017|Lieutenant-Colonel Joseph Costello, CD (Retired) – Individual (Honour)
2016|Membres de l’ Escadron des transmission du Groupe de Soutien de la 2e Division – Collective
2016|Vintage Signals Team – Collective
2016|Lieutenant-Colonel Hubert Jansen, CD (Retired) – Individual (Merit)
2016|Master Warrant Officer Victor J. Burke, CD – Individual (Merit)
2016|Lieutenant-Colonel Kenneth Lloyd, CD – Individual (Honour)
2016|Captain James C. Creamer, CD – Individual (Honour)
2016|Colonel Peter H. Sutton, CD (Retired) – Lifetime Achievement`),
  'colonel-in-chief-commendation': parseLegacyRecipients(
    `2025|34|Captain Joseph Pierre Frenette, CD
2020|29|Master Warrant Officer Patrice Guevremont, CD
2020|31|Brigadier-General Bob Martineau, CD (Retired)
2019|30|Chief Warrant Officer William ‘Bill’ Fallows, CD (Retired)
2018|27|Colonel Don F. Pruner, OMM, CD (Retired)
2018|28|Colonel Jim Holsworth, CD (Retired)
2017|26|Brigadier-General William ‘Bill’ Richard, CD (Retired)
2016|25|Major Mike DeNoble, CD (Retired)
2013|1|Brigadier-General George D. Simpson, OMM, CD (Retired)
2013|2|General Ramsay M. Withers, CMM, CD (Retired)
2013|3|Colonel David L. Hart, MM, CD (Retired)
2013|4|Lieutenant-Colonel Dan Bergeron, OMM, CD (Retired)
2013|5|Brigadier-General George D. Simpson, OMM, CD (Retired)
2013|6|Brigadier-General Don Banks, CMM, CD (Retired)
2013|7|Brigadier-General Pep Fraser, OMM, CD (Retired)
2013|8|Brigadier-General William ‘Bill’ J. Patterson, OMM, CD (Retired)
2013|9|Colonel Peter H. Sutton, CD (Retired)
2013|10|Colonel Jack A.P. Thomson, CD (Retired)
2013|11|Colonel Percy A. Tappin, CD (Retired)
2013|12|Major Clair B. Bostwick, MMM, CD (Retired)
2013|13|Major David G. Lawrence, CD (Retired)
2013|14|Major Sandy E. Lipin, CD (Retired)
2013|15|Major Jack Magilton, CD (Retired)
2013|16|Master Warrant Officer Terry R. Murphy, MMM, CD (Retired)
2013|17|Warrant Officer Lisa DeNoble, MMM, CD (Retired)
2013|18|Brigadier-General Michel Charron, OMM, CD (Retired)
2013|19|Brigadier-General Dan P. Harrison, CD (Retired)
2013|20|Captain (Navy) John E. Croft, CD (Retired)
2013|21|Colonel Catherine E. Allan, CD (Retired)
2013|22|Colonel Bob Leitch, CD (Retired)
2013|23|Lieutenant-Colonel Brian P. McDonnell, CD (Retired)
2013|24|Major William ‘Bill’ W. Dyke, MMM, CD (Retired)
2013|99|Her Royal Highness, The Princess Royal, Princess Anne — Initial coin at its conception in 2013`,
    { medallion: true },
  ),
  'branch-commendation': parseLegacyRecipients(`2025|Captain Wyonch
2025|Sergeant Ivey
2025|Corporal Lagace
2025|Master Corporal Gaboury
2025|Master Corporal Cousins
2025|Master Corporal Post
2025|Master Corporal Latham
2025|Master Corporal Mak
2025|Lieutenant Kovacs
2025|Master Corporal Wilson
2025|Corporal Haley
2025|Corporal Pozzobon
2025|Mr. Ralph Knegt
2025|Sergeant Tremblay
2025|Sergeant Larocque
2025|Sergeant Collins
2025|Master Warrant Officer Langevin
2025|Master Seaman Peters
2025|Master Corporal Pittenger
2025|Master Seaman Petit
2025|Master Corporal Trudeau
2025|Master Corporal Curran
2025|Major Czarnowske
2025|Lieutenant-Colonel Niquette
2025|George Stewart
2025|Corporal Kuzyk
2025|Corporal Kayele-Shikwambi
2025|Corporal Ramirez
2025|Captain Palmateer
2025|Master Corporal Marilyn Galarneau
2025|Major Mäité Bera Aberem
2025|Corporal Rianne Felsinger
2025|Corporal Ariana De Almeida
2024|Mr. George Stewart
2024|Corporal Pandeni Kayele-Shikwambi
2024|Corporal Andrea Ramirez
2024|Master Corporal Graeme Curran
2024|Master Corporal Scott Lee
2024|Master Corporal Kenneth Kneabone
2024|Master Corporal Matthew Collins
2024|Master Sailor Alain Petit
2024|Master Corporal Dylan Trudeau
2024|Lieutenant Cory McNeil
2024|Lieutenant Mitchell Peyton
2022|Lieutenant-Colonel Hubert Janssen, CD (Retired)
2022|Major Louis Lemaire, CD
2021|Aviator Tetiana Winchester
2021|Sergeant Terry Cadieux, CD
2018|Signaller Tammy Piatkowski
2017|Ms. Jan Race (Civilian)
2017|Master Corporal Bobby McKay
2017|Master Corporal Charles J. B. Le Moyne
2017|Master Corporal Andrew Griffin
2017|Sergeant Jocelyn Gladu, CD
2017|Master Warrant Officer Dennis Taylor, CD
2017|Major Brigitte Allaire, OMM, CD
2017|Major Ann Ervin, CD
2016|Hamilton Signals Association (Group Award)
2016|Mr. Edward Blight (Civilian)
2016|Mr. Ed Robinson (Civilian)
2016|Mr. Doug Johns (Civilian)
2016|Mr. David A. Douglas (Civilian)
2016|Mr. Chester Jablonski (Civilian)
2016|Mr. Burke Gerhardt (Civilian)
2016|Mr. Barry Bell (Civilian)
2016|Maj Erik M. Esselaar, CD
2016|Lieutenant-Colonel Nicholas P. Torrington-Smith, CD
2016|Lieutenant-Colonel Darren L. Harper, OMM, CD
2016|Colonel Pascal J.P. Godbout, CD
2015|Warrant Officer Stephen P. O’Shea, CD
2015|Major Darrell G. Williams, CD
2015|Lieutenant-Colonel J.S.M. Bouffard, CD (Retired)
2014|Canadian Forces School of Communications & Electronics (Group Award)
2014|Canadian Forces Joint Signal Regiment (Group Award)
2014|Canadian Forces Information Operations Group (Group Award)
2014|76 Communication Group (Group Award)
2014|33 Signal Regiment (Group Award)
2014|32 Signal Regiment (Group Award)
2014|21 Electronic Warfare Regiment (Group Award)
2014|8 Air Communications and Control Squadron (Group Award)
2014|The Signallers’ Club (Group Award)
2014|Hamilton Signals Association (Group Award)
2014|Adjudant Sylvain Gagnon, CD
2014|Chief Warrant Officer J.Y.R. Giard, CD (Retired)
2014|Chief Warrant Officer Marcel M. Dinelle, CD
2014|Captain Gary R. Hayes, CD (Retired)
2014|Major Lorraine H. Fischer, CD
2014|Major Allan E. Ferriss, CD
2014|Major Benoit D. Achim, CD
2014|Lieutenant-Colonel James Lambert, CD
2014|Colonel Walter A. Wood, CD
2013|The CFSCE Publications Development Staff (Group Award)
2013|ATESS / CCISF ATIS Technician Development Cell (Group Award)
2012|Corporal Phillip C. Herring, CD
2012|Caporal-chef P.G.G. Poirier-Dulac
2012|Master Warrant Officer Mark W. Brown, CD
2012|Colonel Jim I. Holsworth, CD (Retired)
2011|Sergeant Heather A. Chapman, CD
2011|Master Warrant Officer Terrence R. Murphy, MMM, CD (Retired)
2011|Colonel George Lackonick, CD
2010|Corporal Robert J. Howatt
2010|Sergent Joseph Sylvain Léger, CD
2010|Lieutenant-Colonel David Gosselin, CD
2010|Lieutenant-Colonel Gerhard ‘Gary’ A.W. Knopf, CD
2008|Lieutenant-Colonel J.A.P. Thomson, CD (Retired)
2007|Master Corporal J.P. Shorter, CD
2007|Warrant Officer M.P. McKinney, CD
2007|Adjudant-chef J.R.Y. Beaudoin, CD
2007|Brigadier-General George D. Simpson, OMM, CD (Retired)
2006|Mr. Jack Magilton (Civilian)
2006|Master Corporal E.A. Morlidge, CD
2006|Adjudant-maître J.W.M.R. Benoît, CD
2005|Mr. Stuart Crawford (Civilian)
2005|Chief Warrant Officer J.A.S. Berthiaume, CD
2004|M. Jean-François Bédard (Civilian)
2004|Caporal Eric J.R. Giroux, CD
2004|Caporal-chef Daniel J. Ouellet, CD
2004|Caporal-chef Yves J. Dorval, CD
2004|Sergeant Claude J.R. Lavoie, CD
2004|Adjudant Marco J.C.Y. Séguin, CD
2004|Adjudant-maître Mario-Roch J.W. Benoît, CD
2004|Chief Warrant Officer R.J. Robillard, CD
2004|Brigadier-General Kevin G. O’Keefe, OMM, CD
2001|Master Corporal Frank Misztal, CD
1995|Captain John A. MacKenzie, CD`),
  'branch-bursary': parseLegacyRecipients(
    `2025|$1,500.00|Joseph Bouchard
2025|$1,500.00|Stephen Hewlett
2025|$1,500.00|Breanna Smith
2024|$1000.00|Sienna Kucherhan
2021|$1000.00|Sadie Benjamin
2020|$750.00|Philip Dawson-Gariepy
2020|$750.00|Marguerite Dawson-Gariepy
2020|$750.00|Liam McQuigge
2020|$750.00|Samantha Stegmeier
2020|$750.00|Cassandra Stabile
2020|$750.00|MacKenzie Ly
2019|$750.00|Abrinna Unser-Doering
2019|$750.00|Sophie MacDonald
2019|$1,500.00|Ann Lambert
2019|$1,500.00|Lauren Awalt
2018|$750.00|Dante Stabile
2018|$750.00|Cpl Nicole Brenner-Rae
2018|$1,500.00|Liam Pederson
2018|$1,500.00|Gabrielle McKenna
2017|$750.00|Alexandra Orprecio Correa
2017|$750.00|Elizabeth Anne Hall
2017|$1,500.00|Nikita Kamblé-Bagal
2017|$1,000.00|Nathan Feuillat
2016|$500.00|Tabatha Fairman
2016|$500.00|Melody Lamontagne
2016|$1,000.00|Evan Davis Clarke
2016|$1,000.00|Keagan Paige MacDonald
2015|$500.00|Kevin Thomas
2015|$500.00|Trevor Robert Marin
2015|$1,000.00|Katie Salter
2015|$1,000.00|Kylie Alexis Gass
2014|$500.00|Curtis Whittla
2014|$500.00|Ellen Elizabeth Hatt
2014|$1,000.00|Emily Sullivan
2014|$1,000.00|Madeline Moore
2013|$500.00|Amanda Pare
2013|$500.00|Jacquelyn Babich
2013|$1,000.00|Michelle Boucher
2013|$1,000.00|Kendra Gass
2012|$500.00|Sarah Anne Charlebois
2012|$500.00|Brayden-Leigh Nielsen
2012|$1,000.00|Andrew Base
2012|$1,000.00|Rebecca L. Beaupre
2011|$500.00|Kaitlin Chapple
2011|$500.00|Anthony Quinn
2011|$1,000.00|B. Gabriella Gonzalez
2011|$1,000.00|Rebecca Beaupre
2010|$500.00|Ryan Ward
2010|$500.00|Jocelyn Doppler
2010|$1,000.00|Kim Lafreniere
2010|$1,000.00|Michelle Conolly
2009|$500.00|Alexander Neil McKenna
2009|$500.00|Brittany Mary Moore
2009|$1,000.00|Robyn Paul
2009|$1,000.00|Dorothy Elizabeth Salnikov
2007|$500.00|Julie Bosse
2007|$500.00|Irina Tessier
2007|$1,000.00|Jennifer McDougall
2007|$1,000.00|Ashley Nickerson`,
    { amount: true },
  ),
});

const BURSARY_AWARD = Object.freeze({
  slug: 'branch-bursary',
  title: 'C&E Branch Bursary',
  sortOrder: 6,
  summary: 'Legacy C&E Branch bursary recipients.',
  recipients: LEGACY_ARCHIVES['branch-bursary'],
  published: true,
});

function toMutableAward(award) {
  return {
    ...award,
    links: (award.links || []).map((link) => ({ ...link })),
    recipients: (award.recipients || []).map((recipient) => ({ ...recipient })),
  };
}

async function ensureProfessionalAwards() {
  for (const award of LEGACY_AWARDS) {
    await ProfessionalAward.updateOne(
      { slug: award.slug },
      { $setOnInsert: { ...toMutableAward(award), published: true } },
      { upsert: true },
    );
  }
  await ProfessionalAward.updateOne(
    { slug: BURSARY_AWARD.slug },
    { $setOnInsert: toMutableAward(BURSARY_AWARD) },
    { upsert: true },
  );

  for (const [slug, legacyRecipients] of Object.entries(LEGACY_ARCHIVES)) {
    const award = await ProfessionalAward.findOne({ slug });
    if (!award) continue;
    const existing = new Set(
      award.recipients.map(
        (item) => `${item.year}|${item.medallionNumber}|${item.name}`,
      ),
    );
    const missing = legacyRecipients.filter(
      (item) =>
        !existing.has(
          `${item.year}|${item.medallionNumber || ''}|${item.name}`,
        ),
    );
    if (missing.length) {
      award.recipients.push(...missing);
      await award.save();
    }
  }

  const bursaryAward = await ProfessionalAward.findOne({
    slug: 'branch-bursary',
  });
  if (bursaryAward) {
    let updated = false;
    bursaryAward.recipients.forEach((recipient) => {
      if (!recipient.amount && /^\$/u.test(recipient.role || '')) {
        recipient.amount = recipient.role;
        recipient.role = '';
        updated = true;
      }
    });
    if (updated) await bursaryAward.save();
  }

  for (const [slug, name, role] of [
    ['subaltern-of-the-year', 'Lieutenant Emerich Kovacs', 'Signals Officer'],
    ['member-of-the-year', 'Master Corporal Stephen Mak', 'Signal Operator'],
  ]) {
    const award = await ProfessionalAward.findOne({ slug });
    if (award && !award.recipients.some((recipient) => recipient.featured)) {
      const recipient = award.recipients.find((item) => item.name === name);
      if (recipient) {
        recipient.featured = true;
        recipient.role = recipient.role || role;
        await award.save();
      }
    }
  }
}

module.exports = { LEGACY_AWARDS, ensureProfessionalAwards };
