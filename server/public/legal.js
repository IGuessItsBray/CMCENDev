const legalPage = document.querySelector('[data-legal-page]');

function appendPlainText(container, value) {
  const fragments = value.split('\u0000');
  fragments.forEach((fragment, index) => {
    if (index) container.append(document.createElement('br'));
    container.append(document.createTextNode(fragment));
  });
}

function appendInlineText(container, value) {
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\)|https?:\/\/[^\s<]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/gu;
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    appendPlainText(container, value.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = token.slice(2, -2);
      container.append(strong);
    } else if (token.startsWith('[')) {
      const separator = token.lastIndexOf('](');
      const link = document.createElement('a');
      link.textContent = token.slice(1, separator);
      link.href = token.slice(separator + 2, -1);
      if (/^https?:/u.test(link.href)) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
      container.append(link);
    } else {
      const link = document.createElement('a');
      link.textContent = token;
      link.href = token.includes('@') ? `mailto:${token}` : token;
      if (/^https?:/u.test(token)) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
      container.append(link);
    }
    cursor = match.index + token.length;
  }
  appendPlainText(container, value.slice(cursor));
}

function cleanMarkdownLine(value) {
  return value
    .replace(/<br\s*\/?\s*>/giu, '')
    .replace(/\\$/u, '')
    .trim();
}

function createTextElement(tagName, value) {
  const element = document.createElement(tagName);
  appendInlineText(element, cleanMarkdownLine(value));
  return element;
}

function parseMarkdown(markdown) {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const documentModel = { title: '', meta: [], preface: [], sections: [] };
  let currentSection = null;
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length || !currentSection) return;
    currentSection.blocks.push({ type: 'paragraph', value: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = () => {
    if (!list || !currentSection) return;
    currentSection.blocks.push(list);
    list = null;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (line.startsWith('# ')) {
      documentModel.title = line.slice(2).replace(/—.*$/u, '').trim();
      return;
    }
    if (/^\*\*(Effective date|Last updated|Organization|Website):/u.test(line)) {
      documentModel.meta.push(cleanMarkdownLine(line).replace(/\*\*/g, ''));
      return;
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      currentSection = {
        title: line.slice(3).replace(/^\d+\.\s+/u, ''),
        blocks: [],
      };
      documentModel.sections.push(currentSection);
      return;
    }
    if (!currentSection) {
      if (line && !/^---+$/u.test(line)) documentModel.preface.push(line);
      return;
    }
    if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      currentSection.blocks.push({ type: 'heading', value: line.slice(4) });
      return;
    }
    if (/^[-*] /u.test(line)) {
      flushParagraph();
      if (!list || list.type !== 'list') list = { type: 'list', items: [] };
      list.items.push(line.slice(2));
      return;
    }
    if (/^\d+\. /u.test(line)) {
      flushParagraph();
      if (!list || list.type !== 'ordered-list') list = { type: 'ordered-list', items: [] };
      list.items.push(line.replace(/^\d+\. /u, ''));
      return;
    }
    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      currentSection.blocks.push({ type: 'quote', value: line.slice(2) });
      return;
    }
    if (line && !/^---+$/u.test(line)) {
      const hasHardBreak = line.endsWith('\\');
      paragraph.push(
        hasHardBreak ? `${line.slice(0, -1)}\u0000` : line,
      );
    } else {
      flushParagraph();
      flushList();
    }
  });
  flushParagraph();
  flushList();
  return documentModel;
}

function renderBlock(block) {
  if (block.type === 'heading') return createTextElement('h3', block.value);
  if (block.type === 'quote') return createTextElement('blockquote', block.value);
  if (block.type === 'list' || block.type === 'ordered-list') {
    const list = document.createElement(block.type === 'list' ? 'ul' : 'ol');
    block.items.forEach((value) => list.append(createTextElement('li', value)));
    return list;
  }
  return createTextElement('p', block.value);
}

async function renderLegalPage() {
  if (!legalPage) return;
  const type = legalPage.dataset.legalPage;
  const language = document.documentElement.lang === 'fr' ? 'fr' : 'en';
  const endpoint = type === 'terms' ? '/api/tos' : '/api/privacy';
  legalPage.className = 'legal-document';
  legalPage.replaceChildren(createTextElement('p', language === 'fr' ? 'Chargement…' : 'Loading…'));

  const response = await fetch(`${endpoint}?lang=${language}`, {
    headers: { Accept: 'text/markdown' },
  });
  if (!response.ok) throw new Error('Could not load the legal document');
  const documentModel = parseMarkdown(await response.text());
  document.title = `${documentModel.title} | CMCEN / RCMCE`;
  legalPage.replaceChildren();

  const hero = document.createElement('header');
  hero.className = 'legal-document__hero';
  hero.innerHTML = '<p class="legal-document__eyebrow">CMCEN / RCMCE</p>';
  hero.append(createTextElement('h1', documentModel.title));
  const metadata = document.createElement('div');
  metadata.className = 'legal-document__meta';
  documentModel.meta.forEach((value) => metadata.append(createTextElement('p', value)));
  hero.append(metadata);
  documentModel.preface.forEach((value) => {
    hero.append(createTextElement(value.startsWith('> ') ? 'blockquote' : 'p', value.replace(/^> /u, '')));
  });

  const navigation = document.createElement('details');
  navigation.className = 'legal-document__navigation';
  const summary = document.createElement('summary');
  summary.textContent = language === 'fr' ? 'Dans cette page' : 'On this page';
  const navigationList = document.createElement('ol');
  navigation.append(summary, navigationList);

  const contentColumn = document.createElement('div');
  contentColumn.className = 'legal-document__content';
  documentModel.sections.forEach((sectionModel, index) => {
    const id = `legal-section-${index + 1}`;
    const navigationItem = document.createElement('li');
    const navigationLink = document.createElement('a');
    navigationLink.href = `#${id}`;
    navigationLink.textContent = sectionModel.title;
    navigationItem.append(navigationLink);
    navigationList.append(navigationItem);

    const section = document.createElement('section');
    section.id = id;
    section.className = 'legal-document__section';
    const number = document.createElement('p');
    number.className = 'legal-document__number';
    number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('div');
    copy.append(createTextElement('h2', sectionModel.title));
    sectionModel.blocks.forEach((block) => copy.append(renderBlock(block)));
    section.append(number, copy);
    contentColumn.append(section);
  });
  legalPage.append(hero, navigation, contentColumn);
}

renderLegalPage().catch((error) => {
  legalPage.replaceChildren(createTextElement('p', error.message));
});
document.addEventListener('languagechange', () => renderLegalPage().catch(() => {}));
