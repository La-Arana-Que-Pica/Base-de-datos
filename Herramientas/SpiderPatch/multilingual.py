"""Spider Patch editorial locales. Spanish fields and technical identities stay canonical."""
import copy
import hashlib
import json
from html import escape, unescape
from dom import parse

LANGUAGES = {'es': 'Español', 'en': 'English', 'pt': 'Português', 'ar': 'العربية', 'it': 'Italiano'}
FIELDS = set('title summary download_note home_description heading description cover_alt download_intro name compatibility instructions warnings alt caption html tagline archive_title items'.split())
CHILDREN = set('product season version seasons versions editions seo blocks downloads files mirrors images'.split())

def nodes(value):
    if isinstance(value, dict):
        yield value
        # Sorted: set order varies between processes (hash seed) and the fingerprint must be stable.
        for key in sorted(CHILDREN & value.keys()):
            yield from nodes(value[key])
    elif isinstance(value, list):
        for item in value: yield from nodes(item)

def editorial(node):
    return {k: v for k, v in node.items() if k in FIELDS and v and isinstance(v, (str, list))}

def fingerprint(value):
    return hashlib.sha256(json.dumps([editorial(n) for n in nodes(value)], ensure_ascii=False, sort_keys=True).encode()).hexdigest()

def missing(value, lang):
    result=[]
    for n in nodes(value):
        translated=n.get('translations', {}).get(lang, {})
        for key, source in editorial(n).items():
            target=translated.get(key)
            if not target or isinstance(source,list) and (not isinstance(target,list) or len(target)!=len(source) or not all(target)):
                result.append(str(n.get('id', 'texto'))+'/'+key)
    return result

def complete(version, lang):
    state=version.get('translation_state', {}).get(lang, {})
    return state.get('status')=='complete' and state.get('source_hash')==fingerprint(version) and not missing(version, lang)

def mark_complete(version, lang):
    absent=missing(version, lang)
    if absent: raise ValueError('Traducción incompleta: '+', '.join(absent[:12]))
    version.setdefault('translation_state', {})[lang]={'status':'complete','source_hash':fingerprint(version)}

def localized(model, lang):
    result=copy.deepcopy(model)
    if lang=='es':return result
    def translate(value):
        for n in nodes(value):
            for key, text in n.get('translations', {}).get(lang, {}).items():
                if key in FIELDS and text:n[key]=copy.deepcopy(text)
    translate(result.get('product', {}))
    translate(result.get('seasons', []))
    for v in result.get('versions', []):
        if complete(v,lang):translate(v)
    return result

def validate_extensions(value, html_check=None):
    """Reject translated technical fields and active HTML, including untrusted JSON imports."""
    for n in nodes(value):
        if 'password' in n and (not isinstance(n['password'],str) or len(n['password'])>200 or any(ord(c)<32 for c in n['password'])):
            raise ValueError('Contraseña inválida (máximo 200 caracteres, sin controles).')
        translations=n.get('translations', {})
        if not isinstance(translations,dict) or set(translations)-set(LANGUAGES.keys()-{'es'}):raise ValueError('Idiomas de traducción inválidos.')
        for lang, fields in translations.items():
            if not isinstance(fields,dict) or set(fields)-FIELDS:raise ValueError('Campo traducido no permitido.')
            for key,target in fields.items():
                if key not in n:raise ValueError('La traducción no tiene campo original: '+key)
                if key=='items':
                    if not isinstance(target,list) or len(target)>2000 or any(not isinstance(t,str) or len(t)>200000 for t in target):raise ValueError('Lista traducida inválida.')
                elif not isinstance(target,str) or len(target)>200000:raise ValueError('Texto traducido inválido.')
                if key in {'html','instructions'} and html_check:html_check(target,'Traducción/'+lang+'/'+key)
        states=n.get('translation_state',{})
        if not isinstance(states,dict) or set(states)-set(LANGUAGES.keys()-{'es'}):raise ValueError('Estado de traducción inválido.')
        for state in states.values():
            if not isinstance(state,dict) or set(state)-{'status','source_hash'} or state.get('status') not in {'draft','complete'} or not isinstance(state.get('source_hash',''),str):raise ValueError('Estado de traducción inválido.')

def extend_document(document, base_validator, html_check):
    """Use the V1 validator for canonical content, then restore validated V2 extensions."""
    version=document.get('schema_version')
    if type(version) is not int or version not in {1,2}:raise ValueError('Se admite schema_version 1 o 2.')
    original=copy.deepcopy(document)
    validate_extensions(original,html_check)
    stripped=copy.deepcopy(original); extras=[]
    for n in nodes(stripped):
        extras.append({k:n.pop(k) for k in ('translations','translation_state','password','show_details') if k in n})
    stripped['schema_version']=1
    result=base_validator(stripped)
    # Base validation supplies defaults but does not reorder editorial entities.
    def attach(src,dest):
        if isinstance(src,dict):
            for key in ('translations','translation_state','password','show_details'):
                if key in src:dest[key]=copy.deepcopy(src[key])
            for key in CHILDREN & src.keys():
                if key in dest:attach(src[key],dest[key])
        elif isinstance(src,list):
            for a,b in zip(src,dest):attach(a,b)
    attach(original,result);result['schema_version']=version
    return result
