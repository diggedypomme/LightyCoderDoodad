# Browser-only Paint MVP

This static page connects directly to an Arcade Coder with the Web Bluetooth API. It has no Python/backend dependency, external JavaScript dependency, build step, or network request after the files load.

## Run it

Use current Chrome or Edge (desktop is recommended for the first hardware test). Firefox and Safari do not currently expose the required Web Bluetooth API.

Web Bluetooth requires a secure context and a user click. For local testing, either:

1. Try opening `index.html` directly in Chrome/Edge. Local-file handling varies by browser version.
2. Serve this folder as `localhost` using an editor's local web server, or with Node if installed:

   ```powershell
   npx --yes serve .
   ```

3. Publish the folder to any HTTPS static host (for example GitHub Pages).

Then power on the board, press **Connect board**, select the Arcade Coder in the browser chooser, draw a few pixels, and press **Send canvas**. The first send starts stock Paint automatically and waits 1.3 seconds before sending.

## Scope and implementation

- Uses service `778d5426-fa29-4363-91fd-a9f5cfcfce85`.
- Writes to command characteristic `e18d056b-7dae-49c1-b5f2-17684801e446` without response.
- Encodes the existing protobuf-like `start_builtin("paint")` and Paint frame commands in JavaScript.
- Converts display RGB to the board's BGR wire order.
- Generates raw DEFLATE with dynamic Huffman literals only. This intentionally avoids distance/back-reference copies because the stock firmware inflater is known to corrupt them.

The browser controls BLE discovery, permissions, connection, and negotiated GATT write size. There is no API for the page to request Android's MTU 517 behavior explicitly, so begin with a sparse canvas. Literal-only Huffman encoding keeps sparse frames small; very colourful/noisy frames may still exceed a platform-specific GATT write limit.

## Protocol self-test

If Node.js is installed, the encoder can be checked without a board:

```powershell
node protocol.test.js
```
