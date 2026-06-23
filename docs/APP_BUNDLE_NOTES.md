# App Bundle Notes

These notes are for anyone who wants to continue the stock app-upload work. The current reliable project path is paint-mode frame sending, but the firmware clearly has a richer app model that is not fully solved yet.

## High-level model

The device is not just a BLE LED panel. The firmware has:

- a command characteristic for control messages
- a callback characteristic for events/frames/errors
- a game/app upload characteristic
- built-in modules such as `paint` and `testmode`
- an embedded VM used by onboard modules and uploaded bundles

The original phone/tablet app almost certainly uploaded or selected VM app bundles, then used commands/events to interact with them.

## Game upload characteristic

The game/app upload characteristic is:

```text
27f450db-9197-4e02-85fd-9cba87639a28
```

The command characteristic is still used to start a saved app by name after upload.

## Protobuf shape that got the name working

Early field guesses were wrong. The important correction was that the runtime name is in Game field 2.

Observed working save shape:

```text
Game {
  field 1: string   required placeholder / unknown purpose
  field 2: string   runtime name used by logs and start command
  field 3: string   optional VM/load argument, may be omitted
  field 4: Costume
}

Costume {
  field 1: string   costume/module name
  field 2: bytes    bytecode/data field
}
```

Using both Game field 1 and field 2 allowed logs like:

```text
GamerService: Saved game 'testclone'
VM: Starting game 'testclone'
```

That means the name problem was solved.

## What did not work yet

Getting the name saved was not enough to run a custom app.

Things that failed or were incomplete:

- Empty-code uploads could save but crashed when started.
- Plain JavaScript source hit serializer limits such as costume string overflow.
- Sending long source/code strings in `Costume.field1` was wrong; that field is a small string field.
- `Costume.field2` accepts bytes, but isolated bytecode/function fragments did not start as standalone apps.
- Extracted `.xsb` manifest-like files could be uploaded and saved, but starting them either errored in the VM or rebooted the board.
- Extracted function bytecode fragments could upload but crashed because they were not complete VM modules with the heap/import context the VM expected.
- Large payloads could hit Windows/BLE write limits if sent in one go.

The central unresolved issue is the exact complete bundle format expected by the VM loader.

## Known bundle-related findings

- Built-in modules exist in firmware, including `paint`, `testmode`, `initial-interaction`, and `matrix`.
- `testmode` can be started directly and visibly cycles colours.
- `paint` can be started directly and then accepts compact canvas updates.
- `matrix` appears to be a support/library module; starting it directly produced a VM host-call error.
- The `.xsb` files extracted from firmware were not all complete standalone uploadable apps. Some were manifests, some were heap/code fragments, and some needed surrounding VM state.

## Why paint mode became the practical path

Paint mode is already a valid onboard app. Instead of solving full app packaging first, we start the stock `paint` module and send it compact canvases. That gives reliable LED control without modifying firmware and without uploading a custom bundle.

## What someone could continue next

Useful next steps for the app-upload path:

1. Identify the exact VM bundle/container format, not just isolated bytecode fragments.
2. Work out how imports such as matrix/lights/pixel functions are registered for uploaded modules.
3. Compare a complete built-in module load path against the upload/start-game path.
4. Determine whether `Game.field3` is a module path, entry-point name, VM argument, or loader hint.
5. Test chunked BLE writes for larger game payloads if Windows rejects a single write.
6. Keep UART attached while testing malformed app payloads, because crashes are easy.

## Safety notes for testing

- Do not repeatedly shotgun unknown fields without UART logs.
- Start with payloads that save cleanly, then start separately.
- Keep a known-good paint/testmode command handy to confirm the board recovered.
- If the board stops responding, power-cycle it.