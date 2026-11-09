"""Prerender de clubes. Sin dependencias externas ni consultas CSV en el cliente.

Esquema de índices/coordenadas/instrucciones contrastado con el lector existente
js/team.js y la documentación del formato TED de PES 2018:
https://implyingrigged.info/wiki/Pro_Evolution_Soccer_2018/Texport_(TED)
Valores avanzados fuera del catálogo se omiten: algunos exports contienen basura.
"""
from __future__ import annotations

import csv
import html
import json
import math
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

from miniface_paths import MinifaceIndex

POSITIONS = ('POR', 'CT', 'LI', 'LD', 'MCD', 'MC', 'MI', 'MD', 'MP', 'EI', 'ED', 'SD', 'DC')
PES_POSITION_KEYS = ('GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF')
GROUPS = ('POR', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'MED', 'MED', 'DEL', 'DEL', 'DEL', 'DEL')
KIT_ORDER = ('1st', '2nd', '3rd', '4th')
KIT_PREVIEW_NAME = re.compile(r'(?P<team>\d+)_DEF_(?P<gk>GK)?(?P<order>1st|2nd|3rd|4th)\.webp')
# Same role tones and classic field surface as js/builder-views.js (Creador de alineaciones, vista Clásica).
ROLE_TONES = {'POR': '#ffe600', 'DEF': '#36c9f5', 'MED': '#79e329', 'DEL': '#ff378e'}


def _pitch_surface():
    # Static copy for a .84 aspect pitch, so the centre circle stays round without JS.
    rx, half = 9.333, 7.467
    path = lambda points: ' '.join(('L' if i else 'M') + f'{x} {y}' for i, (x, y) in enumerate(points))
    lines = ' '.join(path(p) for p in (
        [(6, 4), (94, 4), (94, 94), (6, 94), (6, 4)], [(6, 49), (94, 49)],
        [(21.53, 4), (21.53, 18.14), (78.47, 18.14), (78.47, 4)], [(38.12, 4), (38.12, 8.71), (61.88, 8.71), (61.88, 4)],
        [(21.53, 94), (21.53, 79.86), (78.47, 79.86), (78.47, 94)], [(38.12, 94), (38.12, 89.29), (61.88, 89.29), (61.88, 94)]))
    bands = ''.join(f'<rect x="6" y="{4 + i * 9}" width="88" height="9" fill="{"#286125" if i % 2 else "#225721"}"/>' for i in range(10))
    corners = ''.join(f'<path transform="translate({x} {y}) rotate({a})" d="M1.3 0 A1.3 .86 0 0 1 0 .86"/>'
                      for x, y, a in ((6, 4, 0), (94, 4, 90), (94, 94, 180), (6, 94, 270)))
    spots = ''.join(f'<ellipse cx="50" cy="{y}" rx=".3" ry=".2"/>' for y in (49, 13.43, 84.57))
    return ('<svg xmlns="http://www.w3.org/2000/svg" class="club-pitch-surface" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'
            f'<rect width="100" height="100" rx="1" fill="#19481f"/>{bands}'
            '<defs><filter id="club-grass"><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" stitchTiles="stitch"/></filter></defs>'
            '<rect x="6" y="4" width="88" height="90" filter="url(#club-grass)" opacity=".055"/>'
            f'<g fill="none" stroke="#c2db9b" stroke-width=".32" opacity=".72"><path d="{lines}"/><ellipse cx="50" cy="49" rx="{rx}" ry="7.84"/>'
            f'<path d="M{50 - half} 18.14 A{rx} 7.84 0 0 0 {50 + half} 18.14 M{50 - half} 79.86 A{rx} 7.84 0 0 1 {50 + half} 79.86"/>{corners}</g>'
            f'<g fill="#c2db9b">{spots}</g></svg>')


PITCH_SURFACE = _pitch_surface()
POSITION_ORDER = {position: order for order, position in enumerate(('POR', 'LD', 'CT', 'LI', 'MCD', 'MC', 'MD', 'MI', 'MP', 'ED', 'EI', 'SD', 'DC'))}
ADVANCED = {
    0: 'Desactivada', 1: 'Pegados a la banda', 2: 'Falso nueve',
    3: 'Laterales interiores', 4: 'Laterales ofensivos', 5: 'Rotación de banda',
    6: 'Tiki-taka', 7: 'Centros al área', 8: 'Defensivo', 9: 'Falso extremo',
    10: 'Acumular jugadores en el área', 11: 'Línea defensiva retrasada',
    12: 'Presión tras pérdida', 13: 'Marcaje estrecho', 14: 'Delantero liberado', 15: 'Extremos defensivos',
}


def esc(value):
    return html.escape(str(value if value is not None else ''), quote=True)


def integer(value):
    try:
        return int(str(value).strip())
    except (ValueError, TypeError):
        return None


def normalize(value):
    value = unicodedata.normalize('NFD', str(value or '').casefold())
    return re.sub(r'[^a-z0-9 ]', '', ''.join(c for c in value if not unicodedata.combining(c))).strip()


def pes_rgb(row, prefix, separator=' '):
    channels = [integer(row.get(prefix + separator + c)) for c in 'RGB']
    if any(c is None or not 0 <= c <= 63 for c in channels):
        return None
    return tuple(math.floor(c * 255 / 63 + 0.5) for c in channels)


def rgb(color):
    return f'rgb({color[0]}, {color[1]}, {color[2]})'


def luminance(color):
    channels = [c / 255 for c in color]
    channels = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels]
    return sum(c * w for c, w in zip(channels, (.2126, .7152, .0722)))


def contrast(a, b):
    light, dark = sorted((luminance(a), luminance(b)), reverse=True)
    return (light + .05) / (dark + .05)


def readable_accent(color):
    # Text and controls sit on this fixed, dark surface; original colors remain intact.
    for step in range(101):
        adjusted = tuple(round(c + (255 - c) * step / 100) for c in color)
        if contrast(adjusted, (22, 27, 34)) >= 4.5:
            return adjusted
    return (255, 255, 255)


def team_palette(team):
    """Shared PES-to-CSS palette for club and player pages."""
    primary = pes_rgb(team, 'Team Color 1') or (174, 187, 201)
    secondary = pes_rgb(team, 'Team Color 2') or primary
    accent_source = secondary if max(primary) - min(primary) < 24 and max(secondary) - min(secondary) > max(primary) - min(primary) + 20 else primary
    if contrast(accent_source, (22, 27, 34)) < 2 and contrast(secondary, (22, 27, 34)) > contrast(accent_source, (22, 27, 34)):
        accent_source = secondary
    return primary, secondary, readable_accent(accent_source)


def context_style(team):
    primary, secondary, accent = team_palette(team)
    return f'--db-context-primary:{rgb(primary)};--db-context-secondary:{rgb(secondary)};--db-accent:{rgb(accent)}'


def face_badge(show, full=False, scanned=False):
    if not show:
        return ''
    key, text = ('faces.full', 'Full caras LAqP') if full else ('player.faceStatus.scanned', 'Escaneado en PES 2018') if scanned else ('faces.edited', 'Cara LAqP')
    help_key, help_text = ('faces.fullHelp', 'Todas las caras editadas por LAqP o escaneadas en PES 2018') if full else ('player.faceStatus.scanned', 'Escaneado en PES 2018') if scanned else ('player.faceStatus.edited', 'Cara editada por LAqP')
    return f'<span class="laqp-face-badge{" is-full" if full else " is-scanned" if scanned else ""}" title="{help_text}" data-i18n-title="{help_key}"><span aria-hidden="true">⚑</span> <span data-i18n="{key}">{text}</span></span>'


def full_faces(data, team_id):
    roster = data.rosters.get(team_id, [])
    return bool(roster) and all((entry.player.get('Id') in data.edited_face_ids or entry.player.get('Id') in data.scanned_face_ids) for entry in roster)


def rating_class(value):
    # Shared thresholds and classes from the player profile (overallColor).
    number = integer(value)
    if number is None:
        return ''
    return f'stat-range-{6 if number >= 95 else 5 if number >= 90 else 4 if number >= 80 else 3 if number >= 70 else 2 if number >= 60 else 1}'


def stadium_name(team):
    # Stadium is an internal PES ID; no ID-to-name catalogue is shipped here.
    name = (team.get('StadiumName') or '').strip()
    return name if name not in ('', '-', '0') and not name.isdigit() else ''


def load_kit_previews(root):
    """Render del kit dentro del juego: {team_id: {(arquero, numero): ruta}}, escaneado al generar."""
    previews = {}
    for path in (root / 'img' / 'kits_preview').glob('*/*.webp'):
        match = KIT_PREVIEW_NAME.fullmatch(path.name)
        if match and match['team'] == path.parent.name:
            key = (bool(match['gk']), KIT_ORDER.index(match['order']))
            previews.setdefault(match['team'], {})[key] = f'img/kits_preview/{path.parent.name}/{path.name}'
    return previews


class ClubRenderer:
    def __init__(self, root, data, team_paths, player_paths, country_names, corrected_overall, managers=()):
        self.root, self.data = root, data
        self.team_paths, self.player_paths = team_paths, player_paths
        self.countries, self.overall = country_names, corrected_overall
        self.formations = {r['Id']: r for r in data.formations}
        self.kit_previews = load_kit_previews(root)
        self.managers = list(managers)
        self.tactics = []
        tactic_file = root / 'database' / 'tacticas.csv'
        if tactic_file.is_file():
            with tactic_file.open(encoding='utf-8-sig', newline='') as stream:
                self.tactics = list(csv.DictReader(stream, delimiter=';'))
        # Scan once at build time, never from the browser.
        self.assets = {'teams': {p.name for p in (root / 'img' / 'teams').glob('*.webp')}}
        # Minifaces con el nombre del juego: player_<ID>.webp (IDs inflados sin el 0x40000000).
        self.minifaces = MinifaceIndex(root)

    def asset(self, folder, identifier):
        name = f'{identifier}.webp'
        return f'img/{folder}/{name}' if name in self.assets[folder] else f'img/{folder}/default.webp'

    def miniface(self, player, css='club-face'):
        pid = player.get('Id', '')
        current = self.minifaces.src('players', pid)
        original = self.minifaces.src('pes_original_minifaces', pid, default=None)
        attrs = f'class="{css}" alt="{esc(player.get("Name"))}" width="48" height="48" loading="lazy"'
        # No src until the shared resolver knows the saved mode. A missing PES
        # original goes directly to default, never to the modern miniface.
        return (f'<img {attrs} data-player-id="{esc(pid)}" data-miniface-current-src="{esc(current)}" '
                f'data-miniface-pes-src="{esc(original)}">'
                f'<noscript><img {attrs} src="{esc(current)}"></noscript>')

    def edited(self, player):
        return player.get('Id') in self.data.edited_face_ids and player.get('Id') not in self.data.scanned_face_ids

    def player_link(self, team_id, player, text=None):
        name = text or player.get('Name') or 'Jugador'
        url = self.player_paths.get((team_id, player.get('Id', '')))
        return f'<a href="{esc(url)}">{esc(name)}</a>' if url else esc(name)

    def slot_player(self, team_id, index):
        # Direct, zero-based squad index, NOT an index into a compacted/sorted roster.
        index = integer(index)
        if index is None or not 0 <= index < 32:
            return None
        pid = self.data.squad_by_team_id.get(team_id, {}).get(f'Player {index + 1}', '')
        if not any(entry.player.get('Id') == pid for entry in self.data.rosters.get(team_id, [])):
            return None
        return self.data.player_by_id.get(pid)

    def coordinates(self, row, number, suffix):
        try:
            x, y = (float(row[f'Ubicacion {axis}{number} {suffix}']) for axis in 'XY')
        except (ValueError, KeyError):
            return None
        pos = integer(row.get(f'Posicion {number} {suffix}'))
        if not (0 <= x <= 52 and 0 <= y <= 104) or pos not in range(13):
            return None
        # Vertical depth X grows towards the opponent; Y grows left -> right.
        # Projected into the playing area of the Squad Builder classic surface (x 6-94, y 4-94).
        left, top = 10 + y / 104 * 80, 8 + (1 - x / 52) * 84
        return {'left': round(6 + left * .88, 3), 'top': round(4 + top * .9, 3), 'position': POSITIONS[pos],
                'positionKey': PES_POSITION_KEYS[pos], 'tone': ROLE_TONES[GROUPS[pos]]}

    def formation(self, team_id, row):
        starters = []
        for number in range(1, 12):
            player = self.slot_player(team_id, row.get(f'Indice Jugador {number}'))
            coords = self.coordinates(row, number, 'F1')
            if player and coords:
                starters.append((number, player, coords))
        if not starters:
            return ''
        variants = [('normal', 'Normal', 'F1', 'team.general')]
        if row.get('Fluida F1') == '1':
            for key, label, suffix, label_key in [('ball', 'Con balón', 'F1 Con Balon', 'team.withBall'), ('defense', 'Sin balón', 'F1 Sin Balon', 'team.withoutBall')]:
                if all(self.coordinates(row, n, suffix) for n, _, _ in starters):
                    variants.append((key, label, suffix, label_key))
        controls = ''
        if len(variants) > 1:
            controls = '<div class="club-formation-tabs club-js-control" role="group" aria-label="Estado de la formación" data-i18n-aria-label="team.formationState">' + ''.join(
                f'<button type="button" data-formation="{key}" aria-pressed="{str(key == "normal").lower()}" data-i18n="{label_key}">{label}</button>' for key, label, _, label_key in variants) + '</div>'
        tokens = []
        for number, player, normal in starters:
            states = {key: self.coordinates(row, number, suffix) for key, _, suffix, _ in variants}
            url = self.player_paths.get((team_id, player['Id']), '')
            overall = self.overall(self.data, player) or '—'
            tokens.append(f'<a class="club-pitch-player" href="{esc(url)}" data-formation-player="{number}" '
                          f'data-positions="{esc(json.dumps(states, separators=(",", ":")))}" '
                          f'style="left:{normal["left"]}%;top:{normal["top"]}%;--role-tone:{normal["tone"]}" title="{esc(player.get("Name"))}">'
                          f'<span class="club-pitch-face">{self.miniface(player)}</span>'
                          f'<span class="club-pitch-stats"><span class="club-pitch-position" data-i18n-map="positions" data-i18n-key="{normal["positionKey"]}">{normal["position"]}</span><b>{esc(overall)}</b></span>'
                          f'<span class="club-pitch-name">{esc(player.get("Name"))}</span></a>')
        return f'''<section class="club-section club-formation" id="formacion" aria-labelledby="club-formation-heading">
          <div class="club-section-heading"><h2 id="club-formation-heading" data-i18n="team.formation">Formación</h2>{controls}</div>
          <div class="club-pitch" aria-label="Once inicial; ataque hacia arriba" data-i18n-aria-label="team.pitchAria">{PITCH_SURFACE}{''.join(tokens)}
          </div><p class="club-caption" data-i18n="team.startingEleven">Once inicial · Ataque hacia arriba</p></section>'''

    def tactics_html(self, team_id, row):
        groups = []
        fields = [
            ('team.attack', 'Ataque', [('EstiloAtaque', 'tactics.attackStyle', 'Estilo', {0:('attackStyle.0','Contraataque'), 1:('attackStyle.1','Posesión')}),
                        ('Creacion', 'tactics.buildUp', 'Creación', {0:('buildUp.0','Pase largo'), 1:('buildUp.1','Pase corto')}),
                        ('ZonaAtaque', 'tactics.attackArea', 'Zona', {0:('sideCenter.0','Bandas'), 1:('sideCenter.1','Centro')}),
                        ('Colocacion', 'tactics.positioning', 'Posicionamiento', {0:('positioning.0','Mantener formación'), 1:('positioning.1','Flexible')}),
                        ('ZonaApoyo', 'tactics.supportRange', 'Distancia de apoyo', None)]),
            ('team.defense', 'Defensa', [('EstiloDefensa', 'tactics.defenseStyle', 'Estilo', {0:('defenseStyle.0','Presión en primera línea'), 1:('defenseStyle.1','Defensa total')}),
                         ('ZonaContencion', 'tactics.containmentArea', 'Contención', {0:('centerSide.0','Centro'), 1:('centerSide.1','Bandas')}),
                         ('Presion', 'tactics.pressuring', 'Presión', {0:('pressuring.0','Agresiva'), 1:('pressuring.1','Conservadora')}),
                         ('LineaDefensiva', 'tactics.defensiveLine', 'Línea defensiva', None), ('CierreFilas', 'tactics.compactness', 'Compactación', None)]),
        ]
        # NumAtaq/NumDef are legacy PES16 settings, unused in PES18. Do not present
        # them as active instructions. Valid sliders retain their actual 1..10 value.
        for heading_key, heading, items in fields:
            values = []
            for col, label_key, label, mapping in items:
                value = integer(row.get(col + ' F1'))
                mapped = mapping.get(value) if mapping else None
                display = mapped[1] if mapped else (f'{value}/10' if value in range(1, 11) else None)
                if display:
                    translated_value = f' data-i18n-map="tacticValues" data-i18n-key="{mapped[0]}"' if mapped else ''
                    values.append(f'<div><dt data-i18n="{label_key}">{label}</dt><dd{translated_value}>{display}</dd></div>')
            if values:
                groups.append(f'<h3 data-i18n="{heading_key}">{heading}</h3><dl class="club-facts">{"".join(values)}</dl>')
        advanced = []
        for kind, valid in [('ataque', range(10)), ('defensa', [0, 10, 11, 12, 13, 14, 15])]:
            for slot in (1, 2):
                value = integer(row.get(f'Avanzada {kind} {slot} F1'))
                if value in valid and value != 0:
                    side_key = 'team.attack' if kind == 'ataque' else 'team.defense'
                    side_label = 'Ataque' if kind == 'ataque' else 'Defensa'
                    advanced.append(f'<li><span data-i18n="{side_key}">{side_label}</span>: <span data-i18n-map="advancedTactics" data-i18n-key="{value}">{ADVANCED[value]}</span></li>')
        if advanced:
            groups.append(f'<h3 data-i18n="team.advancedInstructions">Instrucciones avanzadas</h3><ul class="club-advanced">{"".join(advanced)}</ul>')
        # A historical tactic may use the same crest; identify its season rather
        # than suggesting it is the current export's complete configuration.
        for tactic in self.tactics:
            if tactic.get('team_id') == team_id or tactic.get('escudo', '').lstrip('/') == f'img/teams/{team_id}.webp':
                if (self.root / 'tactics' / tactic.get('id', '') / 'index.html').is_file():
                    if tactic.get('temporada'):
                        label = f'Ver táctica histórica · {tactic["temporada"]} →'
                        attr = f' data-i18n="team.historicTactic" data-i18n-params=\'{esc(json.dumps({"season": tactic["temporada"]}, separators=(",", ":")))}\''
                    else:
                        label, attr = 'Ver táctica completa →', ' data-i18n="team.fullTactic"'
                    groups.append(f'<a class="club-text-link" href="/tactics/{quote(tactic["id"], safe="")}/"{attr}>{esc(label)}</a>')
                    break
        return f'<section class="club-section club-tactics"><h2 data-i18n="team.tactics">Táctica</h2>{"".join(groups)}</section>' if groups else ''

    def roles(self, team_id, row):
        entries = []
        for col, label, label_key in [('Capitan','Capitán','assignments.captain'), ('Penalti','Penales','assignments.penalty'), ('TiroCorto','TL corto','assignments.shortFreeKick'), ('TiroLargo','TL largo','assignments.longFreeKick'), ('EsquinaIzquierdo','Córner izquierdo','assignments.leftCorner'), ('EsquinaDerecho','Córner derecho','assignments.rightCorner')]:
            player = self.slot_player(team_id, row.get(col))
            if player:
                entries.append(f'<div data-role="{col}" data-role-player-id="{esc(player["Id"])}"><dt data-i18n="{label_key}">{label}</dt><dd>{self.player_link(team_id, player)}</dd></div>')
        return f'<section class="club-section club-roles"><h2 data-i18n="team.roles">Roles</h2><dl class="club-facts">{"".join(entries)}</dl></section>' if entries else ''

    def coach(self, team):
        coach = self.data.coach_by_id.get(team.get('Coach'), {})
        name = coach.get('Name', '').strip()
        if not name or name == '-':
            return ''
        key = normalize(name)
        matches = [m for m in self.managers if normalize(m.config.get('nombre')) == key]
        if not matches:
            # Abbreviated CSV names: require matching initial AND surname, unique result.
            parts = key.split()
            if len(parts) > 1 and len(parts[0]) == 1:
                matches = [m for m in self.managers if normalize(m.config.get('nombre')).split()[-1:] == parts[-1:]
                           and normalize(m.config.get('nombre')).startswith(parts[0])]
        manager = matches[0] if len(matches) == 1 else None
        photo, link = '', ''
        if manager:
            name = manager.config.get('nombre') or name
            for filename in (manager.config.get('ingame_img') or 'ingame.png', manager.config.get('real_img') or 'real.png'):
                if (self.root / 'database' / 'DTs' / manager.directory / filename).is_file():
                    photo = f'<img src="{esc(manager.url + quote(filename))}" alt="{esc(name)}" width="72" height="84" loading="lazy">'
                    break
            link = f'<a class="club-text-link" href="{esc(manager.url)}" data-i18n="team.viewCoach">Ver ficha del DT →</a>'
        country = self.countries.get(coach.get('Country'), '')
        return f'<section class="club-section club-coach" data-coach-id="{esc(coach.get("Id"))}"><h2 data-i18n="team.coachTitle">Director Técnico</h2><div class="club-coach-profile">{photo}<div><strong>{esc(name)}</strong><p data-i18n-map="countries" data-i18n-key="{esc(coach.get("Country"))}">{esc(country)}</p>{link}</div></div></section>'

    def kits(self, team_id):
        result = []
        team_name = self.data.team_by_id.get(team_id, {}).get('Name', '')
        for (goalkeeper, num), source in sorted(self.kit_previews.get(team_id, {}).items()):
            if goalkeeper:
                label = '<span data-i18n="team.goalkeeperKit">Arquero</span>' + (f' · <span data-i18n="team.kit">Kit</span> {num+1}' if num else '')
                plain = 'Arquero' + (f' kit {num+1}' if num else '')
            else:
                label_key, plain = {0:('team.homeKit','Local'),1:('team.awayKit','Visitante'),2:('team.thirdKit','Tercer kit'),3:('team.fourthKit','Cuarto kit')}[num]
                label = f'<span data-i18n="{label_key}">{plain}</span>'
            result.append(f'<figure class="club-kit" data-kit="{"gk" if goalkeeper else "field"}{num+1}"><img src="{esc(source)}" alt="{esc(team_name)}: {plain}" width="256" height="256" loading="lazy"><figcaption>{label}</figcaption></figure>')
        return f'<section class="club-section club-uniforms"><h2 data-i18n="team.uniforms">Uniformes</h2><div class="club-kits">{"".join(result)}</div></section>' if result else ''

    def rivals(self, team):
        links, seen = [], {team['Id']}
        for field in ('Rival1', 'Rival2', 'Rival3'):
            identifier = team.get(field, '')
            rival = self.data.team_by_id.get(identifier)
            if not rival or identifier in seen or not rival.get('Name') or rival.get('Name') == '-':
                continue
            seen.add(identifier)
            name = esc(rival['Name'])
            links.append(f'<a href="{esc(self.team_paths[identifier])}">{name}</a>' if identifier in self.team_paths else f'<span>{name}</span>')
        return f'<section class="club-section club-rivals"><h2 data-i18n="team.rivals">Rivales</h2><div>{"".join(links)}</div></section>' if links else ''

    def render(self, team, league_html):
        team_id = team['Id']
        roster = self.data.rosters.get(team_id, [])
        primary, secondary, accent = team_palette(team)
        style = f'--team-primary:{rgb(primary)};--team-secondary:{rgb(secondary)};--team-accent:{rgb(accent)};{context_style(team)}'
        scores = [integer(self.overall(self.data, entry.player)) for entry in roster]
        ages = [integer(entry.player.get('Age')) for entry in roster]
        scores, ages = [s for s in scores if s is not None and 0 < s <= 99], [a for a in ages if a is not None and 0 < a < 100]
        summary = f'<span data-i18n="team.players" data-i18n-params=\'{{"count":{len(roster)}}}\'>{len(roster)} jugadores</span>'
        if scores:
            summary += f'<span><span data-i18n="team.average">Media</span> <strong>{sum(scores)/len(scores):.0f}</strong></span>'
        if ages:
            average_age = f'{sum(ages)/len(ages):.1f}'.replace('.', ',')
            summary += f'<span><span data-i18n="team.averageAge">Edad media</span> <strong>{average_age}</strong></span>'
        rows = []
        for entry in roster:
            player = entry.player
            pos = integer(player.get('POS'))
            position = POSITIONS[pos] if pos in range(13) else '—'
            position_key = PES_POSITION_KEYS[pos] if pos in range(13) else ''
            group = GROUPS[pos] if pos in range(13) else ''
            overall = self.overall(self.data, player)
            shirt = integer(entry.shirt_number)
            shirt = shirt if shirt is not None and shirt > 0 else ''
            rows.append(f'<tr data-group="{group}" data-name="{esc(player.get("Name"))}" data-number="{shirt}" data-position="{POSITION_ORDER.get(position, "")}" data-overall="{esc(overall)}" data-age="{esc(player.get("Age"))}" data-roster-player-id="{esc(player["Id"])}" data-face-edited="{int(self.edited(player))}">'
                        f'<td class="club-roster-face">{self.miniface(player)}</td><td class="club-number">{shirt or "—"}</td>'
                        f'<td>{self.player_link(team_id, player)}{face_badge(self.edited(player) or player['Id'] in self.data.scanned_face_ids, scanned=player['Id'] in self.data.scanned_face_ids)}</td><td><span class="club-position" data-i18n-map="positions" data-i18n-key="{position_key}">{position}</span></td><td class="club-overall"><span class="club-rating {rating_class(overall)}">{esc(overall)}</span></td><td>{esc(player.get("Age") or "—")}</td></tr>')
        filters = ''.join(f'<button type="button" data-club-filter="{value}" aria-pressed="{str(value == "").lower()}" data-i18n="{label_key}">{label}</button>' for value,label,label_key in [('', 'Todos','common.allMasc'),('POR','POR','filters.goalkeeper'),('DEF','DEF','filters.defender'),('MED','MED','filters.midfielder'),('DEL','DEL','filters.forward')])
        formation = self.formations.get(team_id, {})
        stadium = stadium_name(team)
        stadium_html = f'<p class="club-stadium">{esc(stadium)}</p>' if stadium else ''
        team_i18n_params = esc(json.dumps({"team": team["Name"]}, ensure_ascii=False))
        return style, f'''<article class="club-detail" data-club-id="{esc(team_id)}" style="{style}">
          <header class="club-hero db-hero"><div class="club-crest"><img src="{self.asset('teams', team_id)}" alt="Escudo de {esc(team['Name'])}" data-i18n-alt="team.crestAlt" data-i18n-params="{team_i18n_params}" width="112" height="112"></div>
            <div class="club-identity"><p class="club-eyebrow" data-i18n="team.optionFile">PES 2018 · Option File</p><h1>{esc(team['Name'])}</h1>{face_badge(full_faces(self.data, team_id), True)}
              <div class="club-meta">{league_html if league_html != '-' else ''}<span data-i18n-map="countries" data-i18n-key="{esc(team.get('Country'))}">{esc(self.countries.get(team.get('Country'), ''))}</span><span><span data-i18n="team.pesId">PES ID</span> {esc(team_id)}</span></div>{stadium_html}
              <div class="club-summary">{summary}</div><a class="club-builder-cta club-text-link" href="/alineaciones.html?team={esc(team_id)}" data-i18n="team.buildLineup">Crear alineación con este equipo</a></div></header>
          {self.coach(team)}<div class="club-layout db-module-grid">{self.tactics_html(team_id, formation)}{self.formation(team_id, formation)}<aside class="club-right-rail" aria-label="Roles, uniformes y rivales" data-i18n-aria-label="team.rightRailAria">{self.roles(team_id, formation)}{self.kits(team_id)}{self.rivals(team)}</aside></div>
          <section class="club-section club-roster" id="plantilla" aria-labelledby="club-roster-heading"><div class="club-section-heading"><h2 id="club-roster-heading" data-i18n="team.squad">Plantilla</h2><span data-roster-count aria-live="polite" data-i18n="team.players" data-i18n-params='{{"count":{len(roster)}}}'>{len(roster)} jugadores</span></div>
            <div class="club-roster-tools"><div class="club-filters club-js-control" role="group" aria-label="Filtrar por posición" data-i18n-aria-label="team.filterPosition">{filters}</div><div data-miniface-control-host></div></div>
            <div class="club-roster-search club-js-control"><label><span data-i18n="team.searchSquad">Buscar en la plantilla</span> <input type="search" data-club-search placeholder="Nombre del jugador" data-i18n-placeholder="team.playerName" autocomplete="off"></label></div>
            <div class="club-roster-search club-js-control"><label><span data-i18n="filters.faceEdited">Caras editadas por LAqP</span><select data-club-face-filter><option value="" data-i18n="common.allMasc">Todos</option><option value="yes" data-i18n="common.yes">Sí</option><option value="no" data-i18n="common.no">No</option></select></label></div>
            <table class="club-roster-table"><caption class="club-sr-only" data-i18n="team.squadCaption" data-i18n-params="{team_i18n_params}">Plantilla de {esc(team['Name'])}</caption><thead><tr><th><span class="club-sr-only">Miniface</span></th><th scope="col" aria-sort="none"><button type="button" data-club-sort="number"># <span class="club-sort-indicator" aria-hidden="true"></span></button></th><th scope="col" aria-sort="none"><button type="button" data-club-sort="name"><span data-i18n="common.player">Jugador</span> <span class="club-sort-indicator" aria-hidden="true"></span></button></th><th scope="col" aria-sort="none"><button type="button" data-club-sort="position"><span data-i18n="common.positionShort">Pos.</span> <span class="club-sort-indicator" aria-hidden="true"></span></button></th><th scope="col" aria-sort="none"><button type="button" data-club-sort="overall"><span data-i18n="common.overall">Media</span> <span class="club-sort-indicator" aria-hidden="true"></span></button></th><th scope="col" aria-sort="none"><button type="button" data-club-sort="age"><span data-i18n="common.age">Edad</span> <span class="club-sort-indicator" aria-hidden="true"></span></button></th></tr></thead><tbody>{''.join(rows)}</tbody></table>
            <p data-roster-empty data-i18n="{'team.noCsvPlayers' if not roster else 'team.noMatches'}"{'' if not roster else ' hidden'}>{'No hay jugadores disponibles en los CSV para esta plantilla.' if not roster else 'No hay jugadores que coincidan con los filtros.'}</p></section>
        </article>'''
