from pathlib import Path
import sys

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))
sys.path.insert(0, str(PROJECT / "app"))

from stock_protocol.arcade_coder import CommandMessage, GameMessage
import server

source = "Engine.spriteClasses.push([new Engine.Sprite(Engine.makeGameCostume(1,1,[0,255,0]),1,1,1,0)]);\n"
payload = GameMessage.source_game("blocks1", source)
assert payload == server.build_native_game("blocks1", source)
assert len(payload) < 512
assert CommandMessage.start_game("trio", 8).hex() == "080012060a047472696f1a050d00000041"

for unsafe in ("var Dot = 1;\n", "(function(){return 1;})();\n"):
    try:
        server.build_native_game("blocks1", unsafe)
    except ValueError:
        pass
    else:
        raise AssertionError(f"unsafe source accepted: {unsafe!r}")

print(f"native game protocol ok ({len(payload)} bytes)")
