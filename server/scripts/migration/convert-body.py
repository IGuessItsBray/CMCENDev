"""Pure HTML-to-body conversion: JSON stdin, JSON stdout, no network/database writes.

Input: {html, sourceOrigin, media: {source URL: retained public original URL}}.
Issues must be reviewed before preparing an import; never execute legacy HTML.
"""
import json
import hashlib
import re
import sys
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit


def safe_url(value, image=False):
    if not value or re.search(r'[\s\\\x00-\x1f\x7f]', value):
        return False
    try:
        u = urlsplit(value)
    except ValueError:
        return False
    if u.username or u.password:
        return False
    if image:
        return u.scheme == 'https'
    if u.scheme in ('http', 'https'):
        return bool(u.netloc)
    return u.scheme == 'mailto' and not u.query and not u.fragment and bool(re.fullmatch(r'[^@?,;:%]+@[^@?,;:%]+\.[a-zA-Z]{2,}', u.path))


def inline_text(nodes):
    return ''.join(n if isinstance(n, str) else '\n' if n['type'] == 'br' else inline_text(n.get('children', [])) for n in nodes)


def without_colors(nodes):
    result = []
    for node in nodes:
        if isinstance(node, str):
            result.append(node)
        elif node['type'] == 'color':
            result.extend(without_colors(node['children']))
        else:
            result.append(dict(node, **({'children': without_colors(node['children'])} if 'children' in node else {})))
    return result


def plain_text(blocks):
    return '\n\n'.join(inline_text(b['children']) if b['type'] == 'paragraph' else b['label'] if b['type'] == 'document' else b['text'] if b['type'] == 'heading' else b.get('caption') or b['image'].get('alt') or b['image']['url'] for b in blocks).strip()


class BodyParser(HTMLParser):
    def __init__(self, origin, media):
        super().__init__(convert_charrefs=True)
        self.origin = origin
        self.media = media
        self.blocks = []
        self.current = None
        self.stack = []
        self.hidden = 0
        self.issues = []
        self.caption_parts = None

    def issue(self, code, **details):
        self.issues.append(dict(code=code, **details))

    def paragraph(self):
        if self.current is None:
            self.current = dict(type='paragraph', children=[])
        return self.current

    def children(self):
        return self.stack[-1][1]['children'] if self.stack else self.paragraph()['children']

    def flush(self):
        if self.stack:
            self.issue('unclosed-inline-markup')
        self.stack = []
        if self.current and inline_text(self.current['children']).strip():
            nodes = self.current['children']
            if isinstance(nodes[0], str):
                nodes[0] = nodes[0].lstrip()
            if isinstance(nodes[-1], str):
                nodes[-1] = nodes[-1].rstrip()
            self.blocks.append(self.current)
        self.current = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style'):
            self.hidden += 1
            self.issue('unsafe-element', tag=tag)
            return
        if self.hidden:
            return
        if tag == 'figcaption':
            self.caption_parts = []
            return
        if self.caption_parts is not None:
            if tag == 'br':
                self.caption_parts.append('\n')
            else:
                self.issue('unsupported-caption-markup', tag=tag)
            return
        if tag == 'figure':
            self.flush()
        if any(k.startswith('on') for k in a):
            self.issue('unsafe-event-attribute', tag=tag)
        styles = dict(part.strip().lower().split(':', 1) for part in a.get('style', '').split(';') if ':' in part)
        styles = {k.strip(): v.strip() for k, v in styles.items()}
        if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3'):
            self.flush()
            self.paragraph()
            align = styles.get('text-align', a.get('align'))
            if align in ('left', 'center', 'right'):
                self.current['align'] = align
            elif align:
                self.issue('unsupported-alignment', value=align)
        if tag in ('iframe', 'object', 'embed', 'table', 'svg', 'ul', 'ol'):
            self.issue('unsupported-element', tag=tag)
        if tag == 'br':
            self.children().append(dict(type='br'))
        if tag == 'img':
            source = urljoin(self.origin + '/', a.get('src', ''))
            target = self.media.get(source)
            if not target or not safe_url(target, image=True):
                self.issue('uninventoried-image', source=source)
                return
            self.flush()
            label = a.get('alt') or source.rsplit('/', 1)[-1] or 'Original image'
            self.blocks.append(dict(type='paragraph', children=[dict(type='link', href=target, children=[label])]))
        types = []
        typ = {'b': 'strong', 'strong': 'strong', 'i': 'em', 'em': 'em', 'u': 'underline'}.get(tag)
        if typ:
            types.append(typ)
        if styles.get('font-weight') in ('bold', '700'):
            types.append('strong')
        if styles.get('font-style') == 'italic':
            types.append('em')
        if 'underline' in styles.get('text-decoration', ''):
            types.append('underline')
        for key, allowed in [('font-weight', ('400', 'normal', 'bold', '700')), ('font-style', ('normal', 'italic')), ('text-decoration', ('none', 'underline'))]:
            if key in styles and styles[key] not in allowed:
                self.issue('unsupported-style-value', property=key, value=styles[key])
        if tag == 'a':
            target = urljoin(self.origin + '/', a['href']) if a.get('href') else ''
            target = self.media.get(target, target)
            if safe_url(target):
                node = dict(type='link', href=target, children=[])
                self.children().append(node)
                self.stack.append((tag, node))
            else:
                self.issue('unsafe-link', href=target)
        for typ in dict.fromkeys(types):
            node = dict(type=typ, children=[])
            self.children().append(node)
            self.stack.append((tag, node))
        color = styles.get('color', a.get('color'))
        if color:
            palette = {'red': 'red', '#ff0000': 'red', '#a52323': 'red', 'blue': 'blue', '#0000ff': 'blue', '#174b9b': 'blue', 'green': 'green', '#008000': 'green', '#21663b': 'green'}
            if color.lower() in palette:
                node = dict(type='color', color=palette[color.lower()], children=[])
                self.children().append(node)
                self.stack.append((tag, node))
            else:
                self.issue('unsupported-color', value=color)
        for key, value in styles.items():
            if key not in ('text-align', 'font-weight', 'font-style', 'text-decoration', 'color'):
                self.issue('unsupported-style', property=key, value=value)

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.hidden = max(0, self.hidden - 1)
            return
        if self.hidden:
            return
        if tag == 'figcaption':
            if self.blocks and self.blocks[-1]['type'] == 'paragraph' and self.blocks[-1]['children'] and isinstance(self.blocks[-1]['children'][0], dict) and self.blocks[-1]['children'][0]['type'] == 'link':
                caption = ''.join(self.caption_parts or []).strip()
                if caption: self.blocks[-1]['children'][0]['children'] = [caption]
            else:
                self.issue('caption-without-image')
            self.caption_parts = None
            return
        if self.caption_parts is not None:
            return
        while self.stack and self.stack[-1][0] == tag:
            _, node = self.stack.pop()
            if node['type'] == 'link' and node['href'].startswith('mailto:'):
                label = inline_text(node['children']).strip()
                if '@' in label and label.lower() != node['href'][7:].lower():
                    self.issue('email-recipient-mismatch', label=label, href=node['href'])
        if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3'):
            self.flush()

    def handle_data(self, data):
        if self.hidden:
            return
        if self.caption_parts is not None:
            self.caption_parts.append(data)
            return
        if not self.hidden:
            parts = data.replace('\r\n', '\n').replace('\r', '\n').split('\n')
            for index, part in enumerate(parts):
                if index:
                    self.children().append(dict(type='br'))
                if part:
                    self.children().append(part)


def convert(value):
    parser = BodyParser(value.get('sourceOrigin', 'https://cmcen-rcmce.ca'), value.get('media', {}))
    def caption(match):
        content = match[1]
        image = re.search(r'<img\b[^>]*>', content, re.I)
        if not image:
            return match[0]
        return '<figure>' + image[0] + '<figcaption>' + content[:image.start()] + content[image.end():] + '</figcaption></figure>'
    html = re.sub(r'\[caption\b[^\]]*\]([\s\S]*?)\[/caption\]', caption, value['html'], flags=re.I)
    parser.feed(html)
    parser.close()
    parser.flush()
    if re.search(r'\[/?[a-zA-Z][^\]]*\]', html):
        parser.issue('unsupported-shortcode')
    blocks = parser.blocks
    if value.get('kind') != 'event':
        blocks = [dict(block, children=without_colors(block['children'])) for block in blocks]
    return dict(version=1, blocks=blocks, text=plain_text(blocks), issues=parser.issues)


def convert_batch(batch):
    """Return a new unfrozen preparation; never modify an approved package."""
    result = json.loads(json.dumps(batch))
    media = result.pop('bodyMediaMap', {})
    for item in result['items']:
        if item['kind'] not in ('event', 'retirement', 'last-post'):
            continue
        field = 'description' if item['kind'] == 'event' else 'messages'
        document = item['document']
        for source in item['sources']:
            if hashlib.sha256(source['originalBody'].encode()).hexdigest() != source['bodySha256']:
                raise ValueError('Retained source hash mismatch')
            converted = convert(dict(html=source['originalBody'], kind=item['kind'], media=media, sourceOrigin=result.get('sourceOrigin', 'https://cmcen-rcmce.ca')))
            language = source['language']
            source['convertedBlocks'] = converted['blocks']
            source['convertedText'] = converted['text']
            source['conversionIssues'] = source.get('conversionIssues', []) + converted['issues']
            document.setdefault(field, {})[language] = converted['text']
            document.setdefault('formattedBody', {})[language] = {k: converted[k] for k in ('version', 'text', 'blocks')}
        if item['kind'] == 'retirement':
            document['message'] = document['messages'][document['messageLanguage']]
    return result


if __name__ == '__main__':
    value = json.load(sys.stdin)
    print(json.dumps(convert_batch(value) if '--batch' in sys.argv[1:] else convert(value), ensure_ascii=False))
