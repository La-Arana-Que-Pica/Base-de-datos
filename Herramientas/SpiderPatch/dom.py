"""Small lossless HTML tree for the existing static templates (standard library only)."""
from html.parser import HTMLParser
from html import escape, unescape
import re

VOID = set('area base br col embed hr img input link meta param source track wbr'.split())

class Node:
    def __init__(self, tag='', attrs=None, raw=None):
        self.tag, self.attrs, self.raw = tag, dict(attrs or []), raw
        self.children, self.parent = [], None
    def add(self, node):
        if isinstance(node, str): node = Node(raw=node)
        node.parent = self
        self.children.append(node)
        return node
    def render(self):
        if self.raw is not None: return self.raw
        inner = ''.join(n.render() for n in self.children)
        if not self.tag: return inner
        attrs = ''.join(' '+k+('="'+escape(str(v), quote=True)+'"' if v is not None else '') for k,v in self.attrs.items())
        return '<'+self.tag+attrs+'>'+('' if self.tag in VOID else inner+'</'+self.tag+'>')
    @property
    def inner(self): return ''.join(n.render() for n in self.children)
    @property
    def text(self): return unescape(re.sub(r'<[^>]+>', '', self.inner)).strip()
    def html(self, value):
        self.children = []
        for n in list(parse(value).children): self.add(n)
        return self
    def text_set(self, value): return self.html(escape(str(value or '')))
    def walk(self):
        for n in self.children:
            yield n
            yield from n.walk()
    def all(self, tag=None, cls=None, id=None, attr=None):
        return [n for n in self.walk() if n.raw is None and (not tag or n.tag==tag) and (not cls or cls in (n.attrs.get('class') or '').split()) and (id is None or n.attrs.get('id')==id) and (not attr or all(n.attrs.get(k)==v for k,v in attr.items()))]
    def find(self, **kwargs): return next(iter(self.all(**kwargs)), None)
    def remove(self):
        if self.parent: self.parent.children.remove(self)
        self.parent = None
    def replace(self, value):
        parent = self.parent
        if not parent: raise ValueError('Node without parent')
        at = parent.children.index(self)
        nodes = list(parse(value).children) if isinstance(value, str) else [value]
        parent.children[at:at+1] = nodes
        for n in nodes: n.parent=parent
        self.parent=None
    def clone(self): return parse(self.render()).children[0]

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.root=Node(); self.stack=[self.root]
    def handle_starttag(self, tag, attrs):
        n=self.stack[-1].add(Node(tag,attrs))
        if tag not in VOID:self.stack.append(n)
    def handle_startendtag(self, tag, attrs): self.stack[-1].add(Node(tag,attrs))
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:
                self.stack=self.stack[:i];break
    def handle_data(self,data):self.stack[-1].add(data)
    def handle_entityref(self,name):self.handle_data('&'+name+';')
    def handle_charref(self,name):self.handle_data('&#'+name+';')
    def handle_comment(self,data):self.handle_data('<!--'+data+'-->')
    def handle_decl(self,data):self.handle_data('<!'+data+'>')
def parse(value):
    p=Parser();p.feed(value);p.close();return p.root
