"""Componentes autorizados y ubicaciones editoriales opcionales (sin código en CSV)."""
import csv
from pathlib import Path

# Para incorporar otro componente, registrar aquí sus recursos mantenidos en el repo.
COMPONENTS = {
    'generador-powershell-minifaces': {
        'title': 'Renombrar minifaces',
        'script': '/js/guide-components/powershell-minifaces.js',
        'style': '/css/guide-components.css',
    },
}


def load_components(root, guides):
    source = Path(root) / 'database/guia-componentes.csv'
    placements = {}
    if not source.exists():
        return placements
    by_id = {guide['id']: guide for guide in guides}
    with source.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream, delimiter=';')
        required = {'guia', 'seccion', 'despues_parrafo', 'componente'}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError('guia-componentes.csv: faltan columnas requeridas')
        for line, row in enumerate(reader, 2):
            if not any(str(value or '').strip() for value in row.values()):
                continue
            try:
                guide = by_id[row['guia'].strip()]
                component = row['componente'].strip()
                if component not in COMPONENTS:
                    raise ValueError('componente no autorizado')
                section = int(row['seccion'])
                if section < 1 or section > len(guide.get('sections', [])):
                    raise ValueError('sección inexistente')
                position = row['despues_parrafo'].strip()
                position = None if not position else int(position)
                if position is not None and not 0 <= position <= len(guide['sections'][section - 1].get('body', [])):
                    raise ValueError('párrafo inexistente')
            except (KeyError, TypeError, ValueError) as error:
                raise ValueError(f'guia-componentes.csv, línea {line}: {error}') from error
            placements.setdefault(guide['id'], {}).setdefault((section, position), []).append(component)
    return placements


def render_components(placements, section, position, heading_level=3):
    return ''.join(
        f'<div class="gl-interactive" data-guide-component="{identifier}" data-heading-level="{min(4,max(2,int(heading_level)))}" aria-label="{COMPONENTS[identifier]["title"]}">'
        '<p>Esta herramienta necesita JavaScript. El resto de la guía puede leerse sin activarlo.</p></div>'
        for identifier in placements.get((section, position), [])
    )


def component_resources(placements):
    identifiers = dict.fromkeys(identifier for group in placements.values() for identifier in group)
    styles = dict.fromkeys(COMPONENTS[key]['style'] for key in identifiers)
    scripts = dict.fromkeys(COMPONENTS[key]['script'] for key in identifiers)
    return ''.join(f'<link rel="stylesheet" href="{path}">' for path in styles) + ''.join(
        f'<script type="module" src="{path}"></script>' for path in scripts)
