"""Totales del catálogo público, sin contar aliases ni versiones antiguas."""
import re


def calculate_statistics(data):
    teams = {tid for tid, team in data.team_by_id.items()
             if tid in data.team_leagues and team.get('Name', '').strip() not in {'', '-'}}
    memberships = {(tid, entry.player['Id']) for tid in teams
                   for entry in data.rosters.get(tid, []) if entry.player.get('Id')}
    leagues = {(row.get('league_id', '').strip(), row.get('league_name', '').strip())
               for row in data.leagues if row.get('league_id', '').strip()
               and row.get('league_name', '').strip()}
    return dict(players=len({pid for _, pid in memberships}), teams=len(teams),
                leagues=len(leagues), memberships=len(memberships))


def render_statistics(source, stats):
    for key in ('players', 'teams', 'leagues'):
        value = f'{stats[key]:,}'.replace(',', '.')
        source, count = re.subn(r'(<(?:strong|dt)\b[^>]*\bid="stat-' + key + r'"[^>]*>)[^<]*(</(?:strong|dt)>)',
                               lambda m: m[1] + value + m[2], source)
        if count != 1:
            raise ValueError(f'Se esperaba una tarjeta stat-{key}; encontradas: {count}')
    return source


def synchronize_statistics(project_root, output_root, data, write):
    stats = calculate_statistics(data)
    for name in ('index.html', 'database.html'):
        target = output_root / name
        source = (target if target.is_file() else project_root / name).read_text(encoding='utf-8-sig')
        source = render_statistics(source, stats)
        # The explanatory note counts memberships, not distinct people.
        if name == 'database.html':
            import json
            params = {key: stats[key] for key in ('memberships', 'teams', 'leagues')}
            source = re.sub(r'(data-i18n="db.staticCount" data-i18n-params=\')[^\']*(\'>)[^<]*',
                            lambda m: m[1] + json.dumps(params, separators=(',', ':')) + m[2]
                            + f'Incluye {stats["memberships"]} relaciones jugador-equipo, {stats["teams"]} equipos y {stats["leagues"]} ligas.', source)
        if not write(target, source):
            raise RuntimeError(f'No se pudieron actualizar estadísticas: {target}')
    return stats


def validate_statistics(root, data):
    stats = calculate_statistics(data)
    for name in ('index.html', 'database.html'):
        source = (root / name).read_text(encoding='utf-8-sig')
        if render_statistics(source, stats) != source:
            raise ValueError(f'Estadísticas desactualizadas en {name}; regenerar la web.')
    return stats


if __name__ == '__main__':
    from pathlib import Path
    from generador_database import load_data, SilentIssues
    root = Path(__file__).resolve().parents[2]
    print(validate_statistics(root, load_data(root / 'database', SilentIssues())))
