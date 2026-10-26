"""The game owns its room contract; the host owns capability enforcement."""
import json
from pathlib import Path

from app.cordis import Service

name = 'anka-outpost-strike'
inject = ['rooms']
provide = [name]
ROOT = Path(__file__).resolve().parents[1]


class FrontlineService(Service):
    def __init__(self, ctx):
        super().__init__(ctx, name)
        ctx.fiber.effect(lambda: ctx.rooms.register(name, self._definition),
                         label='frontline room contract')

    def _definition(self):
        try:
            build = json.loads((ROOT / 'dist/build.json').read_text())['build']
        except (OSError, ValueError, KeyError):
            build = ''
        return dict(root=str(ROOT), entry='dist/index.html', build=build,
                    protocol=1, maps=['desert', 'jungle', 'snow', 'city'],
                    characters=['male', 'female'],
                    guest_events=['player', 'action'],
                    host_events=['pvp-state', 'pvp-effect', 'pvp-finish'])

    def snapshot(self):
        return {'title': 'ANKA 前线对决', 'protocol': 1}
