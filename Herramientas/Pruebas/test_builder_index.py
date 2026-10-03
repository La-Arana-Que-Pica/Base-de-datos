import tempfile
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Herramientas" / "Generadores"))

from generador_database import GeneratorData, RosterEntry, build_builder_index


class BuilderIndexTests(unittest.TestCase):
    def test_deduplicates_player_and_separates_club_from_national_team(self):
        player = {
            'Id': '10', 'Name': 'Jugador', 'POS': '5', 'CMF': '2', 'DMF': '1',
            'Age': '23', 'Country': '236', 'OverallStats': '82',
        }
        club = {'Id': '101', 'Name': 'CLUB', 'Type': '0'}
        national = {'Id': '7', 'Name': 'SELECCION', 'Type': '2'}
        data = GeneratorData(
            players=[player], teams=[club, national], squads=[], leagues=[], appearances=[],
            formations=[], coaches=[], corrected_overalls=[],
            player_by_id={'10': player}, team_by_id={'101': club, '7': national},
            rosters={
                '101': [RosterEntry(player, '8', 1)],
                '7': [RosterEntry(player, '8', 1)],
            },
            team_leagues={
                '101': [{'league_id': '204'}],
                '7': [{'league_id': '9009'}],
            },
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'database').mkdir()
            result = build_builder_index(root, data)

        self.assertEqual(len(result['players']), 1)
        indexed = result['players'][0]
        self.assertEqual(indexed['id'], '10')
        self.assertEqual(indexed['clubIds'], ['101'])
        self.assertEqual(indexed['nationalTeamIds'], ['7'])
        self.assertEqual(indexed['position'], 'CMF')
        self.assertEqual(indexed['secondaryPositions'], ['DMF'])

    def test_includes_registered_team_lineup_from_formation_and_squad_slots(self):
        players = [
            {'Id': str(number), 'Name': f'J{number}', 'POS': '0' if number == 1 else '12', 'Age': '24', 'Country': '144', 'OverallStats': '70'}
            for number in range(1, 13)
        ]
        team = {'Id': '138', 'Name': 'CLUB', 'Type': '0'}
        squad = {'Id': '138', **{f'Player {number}': str(number) for number in range(1, 13)}}
        formation = {'Id': '138', **{
            key: value for number in range(1, 12) for key, value in {
                f'Indice Jugador {number}': str(number - 1), f'Ubicacion X{number} F1': str(number * 3),
                f'Ubicacion Y{number} F1': '52', f'Posicion {number} F1': '0' if number == 1 else '12',
            }.items()
        }}
        data = GeneratorData(
            players=players, teams=[team], squads=[squad], leagues=[], appearances=[], formations=[formation], coaches=[], corrected_overalls=[],
            player_by_id={player['Id']: player for player in players}, team_by_id={'138': team}, squad_by_team_id={'138': squad},
            rosters={'138': [RosterEntry(player, '', index) for index, player in enumerate(players, 1)]}, team_leagues={'138': [{'league_id': '144'}]},
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / 'database').mkdir()
            indexed = build_builder_index(root, data)['teams'][0]['defaultLineup']
        self.assertEqual(len(indexed['xi']), 11)
        self.assertEqual(indexed['xi'][0]['playerId'], '1')
        self.assertEqual(indexed['xi'][0]['x'], 50.0)
        self.assertEqual(indexed['benchPlayerIds'], ['12'])

    def test_exposes_league_names_for_builder_filters(self):
        data = GeneratorData(
            players=[], teams=[], squads=[], appearances=[], formations=[], coaches=[], corrected_overalls=[],
            leagues=[
                {'league_id': '204', 'league_name': 'PREMIER LEAGUE'},
                {'league_id': '144', 'league_name': 'LIGA ARGENTINA'},
            ],
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / 'database').mkdir()
            leagues = build_builder_index(root, data)['leagues']
        self.assertEqual(leagues, [
            {'id': '144', 'name': 'LIGA ARGENTINA'},
            {'id': '204', 'name': 'PREMIER LEAGUE'},
        ])


if __name__ == '__main__':
    unittest.main()
