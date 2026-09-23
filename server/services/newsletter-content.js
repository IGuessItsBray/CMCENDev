const { plainText } = require('../public/newsletter-format');

function normalizeBlocks(value) {
  const fail = () => {
    throw new Error('Invalid newsletter blocks');
  };
  const text = (value, max = 20000) => {
    if (typeof value !== 'string' || value.length > max) fail();
    return value;
  };
  const url = (value, image = false) => {
    text(value, 2000);
    if (/[\\\u0000-\u0020]/u.test(value)) fail();
    if (!image && value.startsWith('/') && !value.startsWith('//'))
      return value;
    try {
      const parsed = new URL(value);
      if (
        !(image ? ['https:'] : ['https:', 'http:', 'mailto:']).includes(
          parsed.protocol,
        )
      )
        fail();
    } catch {
      fail();
    }
    return value;
  };
  let nodes = 0;
  const inline = (values, depth = 0) => {
    if (!Array.isArray(values) || depth > 6) fail();
    return values.map((node) => {
      if (++nodes > 5000) fail();
      if (typeof node === 'string') return text(node);
      if (!node || typeof node !== 'object') fail();
      if (node.type === 'br') return { type: 'br' };
      if (!['strong', 'em', 'link'].includes(node.type)) fail();
      return {
        type: node.type,
        ...(node.type === 'link' ? { href: url(node.href) } : {}),
        children: inline(node.children, depth + 1),
      };
    });
  };
  const dimension = (value) => {
    if (!Number.isInteger(value) || value < 1 || value > 50000) fail();
    return value;
  };
  if (!Array.isArray(value) || value.length > 200) fail();
  const blocks = value.map((block) => {
    if (!block || typeof block !== 'object') fail();
    if (block.type === 'heading')
      return { type: 'heading', text: text(block.text, 500) };
    if (block.type === 'paragraph')
      return { type: 'paragraph', children: inline(block.children) };
    if (block.type === 'list') {
      if (!Array.isArray(block.items) || block.items.length > 200) fail();
      return { type: 'list', items: block.items.map((item) => inline(item)) };
    }
    if (block.type === 'document')
      return {
        type: 'document',
        label: text(block.label, 500),
        href: url(block.href),
      };
    if (block.type !== 'figure' || !block.image) fail();
    const image = {
      url: url(block.image.url, true),
      alt: text(block.image.alt || '', 2000),
    };
    for (const key of ['width', 'height'])
      if (block.image[key]) image[key] = dimension(block.image[key]);
    image.variants = {};
    for (const key of ['thumb', 'medium', 'large', 'hero']) {
      const variant = block.image.variants?.[key];
      if (variant?.url)
        image.variants[key] = {
          url: url(variant.url, true),
          width: dimension(variant.width),
          ...(variant.height ? { height: dimension(variant.height) } : {}),
        };
    }
    if (!Object.keys(image.variants).length) delete image.variants;
    return { type: 'figure', image, caption: text(block.caption || '', 2000) };
  });
  if (
    plainText(blocks).length > 20000 ||
    JSON.stringify(blocks).length > 200000
  )
    fail();
  return blocks;
}

const publicDateStages = [
  {
    $addFields: {
      displayDate: {
        $cond: [
          {
            $and: [
              { $eq: ['$newsletter.archived', true] },
              { $ne: ['$newsletter.date', ''] },
            ],
          },
          {
            $convert: {
              input: '$newsletter.date',
              to: 'date',
              onError: '$publishedAt',
              onNull: '$publishedAt',
            },
          },
          '$publishedAt',
        ],
      },
    },
  },
  { $sort: { displayDate: -1, _id: -1 } },
];
module.exports = { normalizeBlocks, publicDateStages };
