"""Real-export checks. Run: python -m unittest discover -s Herramientas/Pruebas -v"""
import copy
import json
import re
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Herramientas" / "Generadores"))
from generador_database import load_data, corrected_overall, player_squad_context, COUNTRY_NAMES, slugify
from generador_clubes import ClubRenderer, POSITIONS, POSITION_ORDER, pes_rgb, readable_accent, contrast, rating_class, stadium_name, team_palette, context_style
from generador_secciones import load_managers


class Issues:
    def __init__(self):
        self.errors = []
    def info(self, message): pass
    def warning(self, message): pass
    def error(self, message, **kwargs): self.errors.append(message)


class Tags(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.tags = []
        self.feed(source)
    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))
    def having(self, attr):
        return [attrs for _, attrs in self.tags if attr in attrs]


class ClubTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.issues = Issues()
        cls.data = load_data(ROOT / 'database', cls.issues)
        cls.paths = {tid: f'/team/v2/{slugify(t["Name"], "equipo")}-{tid}/'
                     for tid, t in cls.data.team_by_id.items() if tid in cls.data.team_leagues and t.get('Name') not in ('', '-')}
        cls.players = {(tid, e.player['Id']): f'/player/v2/{tid}/{slugify(e.player["Name"], "jugador")}-{e.player["Id"]}/'
                       for tid, roster in cls.data.rosters.items() for e in roster}
        cls.renderer = ClubRenderer(ROOT, cls.data, cls.paths, cls.players, COUNTRY_NAMES,
                                    corrected_overall, load_managers(ROOT, cls.issues))

    def test_color_range_and_contrast(self):
        for team in self.data.teams:
            for prefix in ('Team Color 1', 'Team Color 2'):
                color = pes_rgb(team, prefix)
                self.assertIsNotNone(color)
                self.assertGreaterEqual(contrast(readable_accent(color), (22, 27, 34)), 4.5)
        self.assertEqual(pes_rgb(self.data.team_by_id['101'], 'Team Color 1'), (210, 0, 0))
        self.assertEqual(pes_rgb(self.data.team_by_id['138'], 'Team Color 1'), (255, 255, 255))
        self.assertEqual(pes_rgb(self.data.team_by_id['1247'], 'Team Color 1'), (0, 0, 0))

    def test_requested_real_clubs(self):
        for tid in ('101', '138', '139', '1248', '1247', '109', '1921'):
            with self.subTest(team=tid):
                team = self.data.team_by_id[tid]
                _, source = self.renderer.render(team, '-')
                tags = Tags(source)
                actual = [r['data-roster-player-id'] for r in tags.having('data-roster-player-id')]
                squad = self.data.squad_by_team_id[tid]
                expected = list(dict.fromkeys(squad.get(f'Player {i}') for i in range(1, 33)
                                             if squad.get(f'Player {i}') in self.data.player_by_id))
                self.assertEqual(actual, expected)
                self.assertNotRegex(source, r'class="club-position">\d+<')
                coach = self.data.coach_by_id[team['Coach']]
                self.assertEqual(tags.having('data-coach-id')[0]['data-coach-id'], coach['Id'])
                self.assertIn(COUNTRY_NAMES[coach['Country']], source)
                form = self.renderer.formations[tid]
                buttons = tags.having('data-formation')
                self.assertEqual(len(buttons), 3 if form['Fluida F1'] == '1' else 0)
                for item in tags.having('data-role'):
                    index = int(form[item['data-role']])
                    self.assertEqual(item['data-role-player-id'], squad[f'Player {index+1}'])
                for token in tags.having('data-formation-player'):
                    number = token['data-formation-player']
                    pid = squad[f'Player {int(form[f"Indice Jugador {number}"])+1}']
                    self.assertEqual(token['href'], self.players[(tid, pid)])
                    for state, suffix in [('normal', 'F1'), ('ball', 'F1 Con Balon'), ('defense', 'F1 Sin Balon')]:
                        coords = json.loads(token['data-positions'])
                        if state not in coords: continue
                        self.assertAlmostEqual(coords[state]['left'], 10+float(form[f'Ubicacion Y{number} {suffix}'])/104*80, places=2)
                        self.assertAlmostEqual(coords[state]['top'], 8+(1-float(form[f'Ubicacion X{number} {suffix}'])/52)*84, places=2)
                        self.assertEqual(coords[state]['position'], POSITIONS[int(form[f'Posicion {number} {suffix}'])])

    def test_roles_are_raw_squad_slots_not_lineup_order(self):
        local = copy.deepcopy(self.data)
        squad = local.squad_by_team_id['101']
        squad['Player 1'] = '0'  # gap must not shift the other slots
        renderer = ClubRenderer(ROOT, local, self.paths, self.players, COUNTRY_NAMES, corrected_overall)
        self.assertIsNone(renderer.slot_player('101', '0'))
        self.assertEqual(renderer.slot_player('101', '1')['Id'], squad['Player 2'])
        self.assertIsNone(renderer.slot_player('101', '255'))
        row = dict(renderer.formations['101'], Capitan='1', Penalti='255', **{'Indice Jugador 2':'9'})
        roles = Tags(renderer.roles('101', row)).having('data-role')
        self.assertEqual(next(r['data-role-player-id'] for r in roles if r['data-role']=='Capitan'), squad['Player 2'])
        self.assertFalse(any(r['data-role']=='Penalti' for r in roles))

    def test_player_context_uses_f1_squad_indices_and_real_rankings(self):
        team_id = '173'  # Manchester City
        formation = next(row for row in self.data.formations if row['Id'] == team_id)
        roster = self.data.rosters[team_id]
        for entry in roster:
            context = player_squad_context(self.data, team_id, entry, formation, self.players)
            self.assertEqual(context['starter'], (entry.slot - 1) in {
                int(formation[f'Indice Jugador {number}']) for number in range(1, 12)
                if formation[f'Indice Jugador {number}'].isdigit()})
            self.assertGreaterEqual(context['rank'], 1)
            self.assertGreaterEqual(context['positionRank'], 1)
            self.assertTrue(all(peer['url'] in self.players.values() for peer in context['competition']))

    def test_incomplete_variant_hidden(self):
        row = dict(self.renderer.formations['101'])
        row['Ubicacion X1 F1 Con Balon'] = ''
        self.assertNotIn('data-formation="ball"', self.renderer.formation('101', row))
        self.assertIn('data-formation="defense"', self.renderer.formation('101', row))

    def test_uniforms_and_missing_sections(self):
        self.assertEqual(self.renderer.kits('1921'), '')
        self.assertEqual(self.renderer.rivals(self.data.team_by_id['1921']), '')
        self.assertIn('Cuarto kit', self.renderer.kits('101'))
        for tid in ('101', '109', '138', '1248'):
            source = self.renderer.kits(tid)
            for kit in self.renderer.uniforms[tid]:
                for prefix in ('Shirt_Base', 'Pant', 'Socks'):
                    expected = tuple(int(int(kit[f'{prefix}_{c}'])*255/63+.5) for c in 'RGB')
                    self.assertIn(f'rgb{expected}', source)

    def test_rivals_resolve_to_existing_id_urls(self):
        for tid in ('101', '138', '139', '1248'):
            team = self.data.team_by_id[tid]
            source = self.renderer.rivals(team)
            links = [a['href'] for tag, a in Tags(source).tags if tag=='a']
            expected = list(dict.fromkeys(self.paths[team[f'Rival{i}']] for i in range(1,4)
                           if team[f'Rival{i}'] in self.paths and team[f'Rival{i}'] != tid))
            self.assertEqual(links, expected)

    def test_unpublished_rivals_are_named_but_not_linked(self):
        source = self.renderer.rivals(self.data.team_by_id['105'])
        self.assertIn('MILLWALL FC', source)
        self.assertIn(self.paths['102'], source)
        self.assertNotIn('href="/team/v2/millwall', source)
        self.assertNotIn('<img', source)

    def test_stadium_and_existing_rating_scale(self):
        self.assertEqual(stadium_name(self.data.team_by_id['180']), "l'Abbé-Deschamps")
        self.assertEqual(stadium_name(self.data.team_by_id['109']), 'Santiago Bernabéu')
        self.assertEqual(stadium_name(self.data.team_by_id['101']), '')
        self.assertEqual([rating_class(value) for value in (59,60,70,80,90,95)],
                         [f'stat-range-{i}' for i in range(1,7)])
        self.assertEqual([POSITION_ORDER[p] for p in ('POR','LD','CT','LI','MCD','MC','MD','MI','MP','ED','EI','SD','DC')], list(range(13)))

    def test_shared_team_palette_and_equal_height_rail(self):
        for team_id in ('101', '138', '1247', '126', '137'):
            team = self.data.team_by_id[team_id]
            primary, secondary, accent = team_palette(team)
            self.assertEqual(primary, pes_rgb(team, 'Team Color 1'))
            self.assertEqual(secondary, pes_rgb(team, 'Team Color 2'))
            self.assertGreaterEqual(contrast(accent, (22, 27, 34)), 4.5)
            self.assertIn('--db-accent:', context_style(team))
            _, source = self.renderer.render(team, '-')
            self.assertIn('class="club-layout db-module-grid"', source)
            self.assertIn('class="club-right-rail"', source)
            self.assertNotIn('class="club-bottom"', source)

    def test_generated_player_context_and_league_summary(self):
        arsenal_player = ROOT / 'player' / 'v2' / '101' / 'b-saka-108693' / 'index.html'
        player_html = arsenal_player.read_text(encoding='utf-8')
        self.assertIn('css/database-system.css', player_html)
        self.assertIn('js/database-rating.js', player_html)
        self.assertIn(context_style(self.data.team_by_id['101']), player_html)
        league_html = (ROOT / 'league' / 'v2' / 'premier-league-204' / 'index.html').read_text(encoding='utf-8')
        self.assertIn('class="db-club-grid"', league_html)
        self.assertIn('jugadores</span>', league_html)
        self.assertIn('class="db-club-row"', league_html)

    def test_coach_link_and_unknown_tactics(self):
        self.assertIn('/database/DTs/arteta-2026/', self.renderer.coach(self.data.team_by_id['101']))
        self.assertIn('Mikel Arteta', self.renderer.coach(self.data.team_by_id['101']))
        row = {'EstiloAtaque F1':'999', 'Avanzada ataque 1 F1':'1122944768', 'NumAtaq F1':'3'}
        source = self.renderer.tactics_html('1921', row)
        self.assertEqual(source, '')

    def test_no_speculative_face_src_and_existing_assets(self):
        for tid in ('101', '138', '139', '1248', '1247', '109', '1921'):
            _, source = self.renderer.render(self.data.team_by_id[tid], '-')
            for tag, attrs in Tags(source).tags:
                if tag != 'img': continue
                if 'data-player-id' in attrs:
                    self.assertNotIn('src', attrs)
                for key in ('src', 'data-miniface-current-src', 'data-miniface-pes-src'):
                    if attrs.get(key):
                        from urllib.parse import unquote
                        self.assertTrue((ROOT / unquote(attrs[key]).lstrip('/')).is_file(), attrs[key])

    def test_generated_pages_use_source_and_shared_scripts(self):
        for tid in ('101', '138', '139', '1248', '1247', '109'):
            page = (ROOT / self.paths[tid].strip('/') / 'index.html').read_text(encoding='utf-8')
            self.assertIn('js/club.js', page)
            self.assertIn('js/minifaces.js', page)
            self.assertIn('css/database-system.css', page)
            self.assertNotIn('js/team.js', page)
            self.assertNotIn('{{', page)
            _, body = self.renderer.render(self.data.team_by_id[tid], '-')
            # Compare deterministic components independently of breadcrumb league markup.
            for component in (self.renderer.formation(tid,self.renderer.formations[tid]), self.renderer.kits(tid), self.renderer.roles(tid,self.renderer.formations[tid])):
                self.assertIn(component, page)
            self.assertEqual(body, self.renderer.render(self.data.team_by_id[tid], '-')[1])

    def test_public_team_scope(self):
        self.assertEqual(len(self.paths), 235)
        for tid in ('1','1921','387','207'):
            self.assertNotIn(tid, self.paths)
            matches = list((ROOT / 'team' / 'v2').glob(f'*-{tid}/index.html'))
            self.assertFalse(matches, tid)

    def test_source_errors_remain_visible_and_classified(self):
        # An assertion on category rather than count permits future CSV repairs.
        self.assertTrue(all(re.fullmatch(r'Equipo \d+: jugador inexistente \d+ en el slot \d+\.', e) for e in self.issues.errors))


if __name__ == '__main__':
    unittest.main()
