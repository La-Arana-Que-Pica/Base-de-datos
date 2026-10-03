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

POSITIONS = ('POR', 'CT', 'LI', 'LD', 'MCD', 'MC', 'MI', 'MD', 'MP', 'EI', 'ED', 'SD', 'DC')
GROUPS = ('POR', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'MED', 'MED', 'DEL', 'DEL', 'DEL', 'DEL')
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


class ClubRenderer:
    def __init__(self, root, data, team_paths, player_paths, country_names, corrected_overall, managers=()):
        self.root, self.data = root, data
        self.team_paths, self.player_paths = team_paths, player_paths
        self.countries, self.overall = country_names, corrected_overall
        self.formations = {r['Id']: r for r in data.formations}
        self.uniforms = {}
        for row in data.uniforms:
            self.uniforms.setdefault(row.get('Id_Team'), []).append(row)
        self.managers = list(managers)
        self.tactics = []
        tactic_file = root / 'database' / 'tacticas.csv'
        if tactic_file.is_file():
            with tactic_file.open(encoding='utf-8-sig', newline='') as stream:
                self.tactics = list(csv.DictReader(stream, delimiter=';'))
        # Scan once at build time, never from the browser.
        self.assets = {
            folder: {p.name for p in (root / 'img' / folder).glob('*.webp')}
            for folder in ('players', 'pes_original_minifaces', 'teams')
        }

    def asset(self, folder, identifier):
        name = f'{identifier}.webp'
        return f'img/{folder}/{name}' if name in self.assets[folder] else f'img/{folder}/default.webp'

    def miniface(self, player, css='club-face'):
        pid = player.get('Id', '')
        current = self.asset('players', pid)
        original = f'img/pes_original_minifaces/{pid}.webp' if f'{pid}.webp' in self.assets['pes_original_minifaces'] else ''
        attrs = f'class="{css}" alt="{esc(player.get("Name"))}" width="48" height="48" loading="lazy"'
        # No src until the shared resolver knows the saved mode. A missing PES
        # original goes directly to default, never to the modern miniface.
        return (f'<img {attrs} data-player-id="{esc(pid)}" data-miniface-current-src="{esc(current)}" '
                f'data-miniface-pes-src="{esc(original)}">'
                f'<noscript><img {attrs} src="{esc(current)}"></noscript>')

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
        return {'left': round(10 + y / 104 * 80, 3), 'top': round(8 + (1 - x / 52) * 84, 3), 'position': POSITIONS[pos]}

    def formation(self, team_id, row):
        starters = []
        for number in range(1, 12):
            player = self.slot_player(team_id, row.get(f'Indice Jugador {number}'))
            coords = self.coordinates(row, number, 'F1')
            if player and coords:
                starters.append((number, player, coords))
        if not starters:
            return ''
        variants = [('normal', 'Normal', 'F1')]
        if row.get('Fluida F1') == '1':
            for key, label, suffix in [('ball', 'Con balón', 'F1 Con Balon'), ('defense', 'Sin balón', 'F1 Sin Balon')]:
                if all(self.coordinates(row, n, suffix) for n, _, _ in starters):
                    variants.append((key, label, suffix))
        controls = ''
        if len(variants) > 1:
            controls = '<div class="club-formation-tabs club-js-control" role="group" aria-label="Estado de la formación">' + ''.join(
                f'<button type="button" data-formation="{key}" aria-pressed="{str(key == "normal").lower()}">{label}</button>' for key, label, _ in variants) + '</div>'
        tokens = []
        for number, player, normal in starters:
            states = {key: self.coordinates(row, number, suffix) for key, _, suffix in variants}
            url = self.player_paths.get((team_id, player['Id']), '')
            tokens.append(f'<a class="club-pitch-player" href="{esc(url)}" data-formation-player="{number}" '
                          f'data-positions="{esc(json.dumps(states, separators=(",", ":")))}" '
                          f'style="left:{normal["left"]}%;top:{normal["top"]}%" title="{esc(player.get("Name"))}">'
                          f'{self.miniface(player)}<span class="club-pitch-name">{esc(player.get("Name"))}</span>'
                          f'<span class="club-pitch-position">{normal["position"]}</span></a>')
        return f'''<section class="club-section club-formation" id="formacion" aria-labelledby="club-formation-heading">
          <div class="club-section-heading"><h2 id="club-formation-heading">Formación</h2>{controls}</div>
          <div class="club-pitch" aria-label="Once inicial; ataque hacia arriba">
            <span class="club-pitch-half" aria-hidden="true"></span><span class="club-pitch-circle" aria-hidden="true"></span>
            <span class="club-pitch-area club-pitch-area-top" aria-hidden="true"></span>
            <span class="club-pitch-area club-pitch-area-bottom" aria-hidden="true"></span>{''.join(tokens)}
          </div><p class="club-caption">Once inicial · Ataque hacia arriba</p></section>'''

    def tactics_html(self, team_id, row):
        groups = []
        fields = [
            ('Ataque', [('EstiloAtaque', 'Estilo', {0:'Contraataque', 1:'Posesión'}),
                        ('Creacion', 'Creación', {0:'Pase largo', 1:'Pase corto'}),
                        ('ZonaAtaque', 'Zona', {0:'Bandas', 1:'Centro'}),
                        ('Colocacion', 'Posicionamiento', {0:'Mantener formación', 1:'Flexible'}),
                        ('ZonaApoyo', 'Distancia de apoyo', None)]),
            ('Defensa', [('EstiloDefensa', 'Estilo', {0:'Presión en primera línea', 1:'Defensa total'}),
                         ('ZonaContencion', 'Contención', {0:'Centro', 1:'Bandas'}),
                         ('Presion', 'Presión', {0:'Agresiva', 1:'Conservadora'}),
                         ('LineaDefensiva', 'Línea defensiva', None), ('CierreFilas', 'Compactación', None)]),
        ]
        # NumAtaq/NumDef are legacy PES16 settings, unused in PES18. Do not present
        # them as active instructions. Valid sliders retain their actual 1..10 value.
        for heading, items in fields:
            values = []
            for col, label, mapping in items:
                value = integer(row.get(col + ' F1'))
                display = mapping.get(value) if mapping else (f'{value}/10' if value in range(1, 11) else None)
                if display:
                    values.append(f'<div><dt>{label}</dt><dd>{display}</dd></div>')
            if values:
                groups.append(f'<h3>{heading}</h3><dl class="club-facts">{"".join(values)}</dl>')
        advanced = []
        for kind, valid in [('ataque', range(10)), ('defensa', [0, 10, 11, 12, 13, 14, 15])]:
            for slot in (1, 2):
                value = integer(row.get(f'Avanzada {kind} {slot} F1'))
                if value in valid and value != 0:
                    advanced.append(f'<li>{"Ataque" if kind == "ataque" else "Defensa"}: {ADVANCED[value]}</li>')
        if advanced:
            groups.append(f'<h3>Instrucciones avanzadas</h3><ul class="club-advanced">{"".join(advanced)}</ul>')
        # A historical tactic may use the same crest; identify its season rather
        # than suggesting it is the current export's complete configuration.
        for tactic in self.tactics:
            if tactic.get('team_id') == team_id or tactic.get('escudo', '').lstrip('/') == f'img/teams/{team_id}.webp':
                if (self.root / 'tactics' / tactic.get('id', '') / 'index.html').is_file():
                    label = f'Ver táctica histórica · {tactic["temporada"]} →' if tactic.get('temporada') else 'Ver táctica completa →'
                    groups.append(f'<a class="club-text-link" href="/tactics/{quote(tactic["id"], safe="")}/">{esc(label)}</a>')
                    break
        return f'<section class="club-section club-tactics"><h2>Táctica</h2>{"".join(groups)}</section>' if groups else ''

    def roles(self, team_id, row):
        entries = []
        for col, label in [('Capitan','Capitán'), ('Penalti','Penales'), ('TiroCorto','TL corto'), ('TiroLargo','TL largo'), ('EsquinaIzquierdo','Córner izquierdo'), ('EsquinaDerecho','Córner derecho')]:
            player = self.slot_player(team_id, row.get(col))
            if player:
                entries.append(f'<div data-role="{col}" data-role-player-id="{esc(player["Id"])}"><dt>{label}</dt><dd>{self.player_link(team_id, player)}</dd></div>')
        return f'<section class="club-section club-roles"><h2>Roles</h2><dl class="club-facts">{"".join(entries)}</dl></section>' if entries else ''

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
            link = f'<a class="club-text-link" href="{esc(manager.url)}">Ver ficha del DT →</a>'
        country = self.countries.get(coach.get('Country'), '')
        return f'<section class="club-section club-coach" data-coach-id="{esc(coach.get("Id"))}"><h2>Director Técnico</h2><div class="club-coach-profile">{photo}<div><strong>{esc(name)}</strong><p>{esc(country)}</p>{link}</div></div></section>'

    def kits(self, team_id):
        result, seen = [], set()
        for kit in sorted(self.uniforms.get(team_id, []), key=lambda k: (k.get('Competition',''), k.get('Goalkeeper') == 'True', integer(k.get('Num_Kit')) or 0)):
            num = integer(kit.get('Num_Kit'))
            if num is None or not 0 <= num < 10:
                continue
            goalkeeper = kit.get('Goalkeeper') == 'True'
            key = (goalkeeper, num, kit.get('Competition'))
            if key in seen:
                continue
            seen.add(key)
            label = ('Arquero' if num == 0 else f'Arquero · Kit {num+1}') if goalkeeper else {0:'Local',1:'Visitante',2:'Tercer kit',3:'Cuarto kit'}.get(num, f'Kit {num+1}')
            samples = []
            for prefix, part in [('Shirt_Base', 'Camiseta'), ('Pant', 'Pantalón'), ('Socks', 'Medias')]:
                color = pes_rgb(kit, prefix, '_')
                if color:
                    samples.append(f'<span class="club-kit-part"><i style="background:{rgb(color)}" aria-label="{part}: {rgb(color)}" role="img"></i><small>{part}</small></span>')
            if samples:
                result.append(f'<div class="club-kit" data-kit-id="{esc(kit.get("Id"))}"><h3>{label}</h3><div class="club-kit-colors">{"".join(samples)}</div></div>')
        return f'<section class="club-section club-uniforms"><h2>Uniformes</h2><div class="club-kits">{"".join(result)}</div></section>' if result else ''

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
        return f'<section class="club-section club-rivals"><h2>Rivales</h2><div>{"".join(links)}</div></section>' if links else ''

    def render(self, team, league_html):
        team_id = team['Id']
        roster = self.data.rosters.get(team_id, [])
        primary, secondary, accent = team_palette(team)
        style = f'--team-primary:{rgb(primary)};--team-secondary:{rgb(secondary)};--team-accent:{rgb(accent)};{context_style(team)}'
        scores = [integer(self.overall(self.data, entry.player)) for entry in roster]
        ages = [integer(entry.player.get('Age')) for entry in roster]
        scores, ages = [s for s in scores if s is not None and 0 < s <= 99], [a for a in ages if a is not None and 0 < a < 100]
        summary = f'<span><strong>{len(roster)}</strong> jugadores</span>'
        if scores:
            summary += f'<span>Media <strong>{sum(scores)/len(scores):.0f}</strong></span>'
        if ages:
            summary += f'<span>Edad media <strong>{sum(ages)/len(ages):.1f}</strong></span>'.replace('.', ',')
        rows = []
        for entry in roster:
            player = entry.player
            pos = integer(player.get('POS'))
            position = POSITIONS[pos] if pos in range(13) else '—'
            group = GROUPS[pos] if pos in range(13) else ''
            overall = self.overall(self.data, player)
            shirt = integer(entry.shirt_number)
            shirt = shirt if shirt is not None and shirt > 0 else ''
            rows.append(f'<tr data-group="{group}" data-name="{esc(player.get("Name"))}" data-number="{shirt}" data-position="{POSITION_ORDER.get(position, "")}" data-overall="{esc(overall)}" data-age="{esc(player.get("Age"))}" data-roster-player-id="{esc(player["Id"])}">'
                        f'<td class="club-roster-face">{self.miniface(player)}</td><td class="club-number">{shirt or "—"}</td>'
                        f'<td>{self.player_link(team_id, player)}</td><td><span class="club-position">{position}</span></td><td class="club-overall"><span class="club-rating {rating_class(overall)}">{esc(overall)}</span></td><td>{esc(player.get("Age") or "—")}</td></tr>')
        filters = ''.join(f'<button type="button" data-club-filter="{value}" aria-pressed="{str(value == "").lower()}">{label}</button>' for value,label in [('', 'Todos'),('POR','POR'),('DEF','DEF'),('MED','MED'),('DEL','DEL')])
        formation = self.formations.get(team_id, {})
        stadium = stadium_name(team)
        stadium_html = f'<p class="club-stadium">{esc(stadium)}</p>' if stadium else ''
        return style, f'''<article class="club-detail" data-club-id="{esc(team_id)}" style="{style}">
          <header class="club-hero db-hero"><div class="club-crest"><img src="{self.asset('teams', team_id)}" alt="Escudo de {esc(team['Name'])}" width="112" height="112"></div>
            <div class="club-identity"><p class="club-eyebrow">PES 2018 · Option File</p><h1>{esc(team['Name'])}</h1>
              <div class="club-meta">{league_html if league_html != '-' else ''}<span>{esc(self.countries.get(team.get('Country'), ''))}</span><span>PES ID {esc(team_id)}</span></div>{stadium_html}
              <div class="club-summary">{summary}</div><a class="club-builder-cta club-text-link" href="/alineaciones.html?team={esc(team_id)}">Crear alineación con este equipo</a></div></header>
          <div class="ad-placement" data-ad-placement="team-top" data-ad-unit-target="banner"></div>
          {self.coach(team)}<div class="club-layout db-module-grid">{self.tactics_html(team_id, formation)}{self.formation(team_id, formation)}<aside class="club-right-rail" aria-label="Roles, uniformes y rivales">{self.roles(team_id, formation)}{self.kits(team_id)}{self.rivals(team)}</aside></div>
          <div class="ad-placement" data-ad-placement="team-mid" data-ad-unit-target="banner"></div>
          <section class="club-section club-roster" id="plantilla" aria-labelledby="club-roster-heading"><div class="club-section-heading"><h2 id="club-roster-heading">Plantilla</h2><span data-roster-count aria-live="polite">{len(roster)} jugadores</span></div>
            <div class="club-roster-tools"><div class="club-filters club-js-control" role="group" aria-label="Filtrar por posición">{filters}</div><div data-miniface-control-host></div></div>
            <div class="club-roster-search club-js-control"><label>Buscar en la plantilla <input type="search" data-club-search placeholder="Nombre del jugador" autocomplete="off"></label></div>
            <table class="club-roster-table"><caption class="club-sr-only">Plantilla de {esc(team['Name'])}</caption><thead><tr><th><span class="club-sr-only">Miniface</span></th><th scope="col" aria-sort="none"><button type="button" data-club-sort="number"># <span class="club-sort-indicator" aria-hidden="true"></span></button></th><th scope="col" aria-sort="none"><button type="button" data-club-sort="name">Jugador <span class="club-sort-indicator" aria-hidden="true"></span></button></th><th scope="col" aria-sort="none"><button type="button" data-club-sort="position">Pos. <span class="club-sort-indicator" aria-hidden="true"></span></button></th><th scope="col" aria-sort="none"><button type="button" data-club-sort="overall">Media <span class="club-sort-indicator" aria-hidden="true"></span></button></th><th scope="col" aria-sort="none"><button type="button" data-club-sort="age">Edad <span class="club-sort-indicator" aria-hidden="true"></span></button></th></tr></thead><tbody>{''.join(rows)}</tbody></table>
            <p data-roster-empty{'' if not roster else ' hidden'}>{'No hay jugadores disponibles en los CSV para esta plantilla.' if not roster else 'No hay jugadores que coincidan con los filtros.'}</p></section>
        </article>'''
