# companion-module-avproedge-mxnet

This is a module for controlling an [AvProEdge MXnet](https://www.avproglobal.com/pages/mxnet) network.

The following docs have been used for reference:
 * [How to use the MXNET API](./docs/support/How%20to%20use%20the%20MXNET%20API%206-21-2021.pdf)
 * [IPCBox API](./docs/support/IPCBox%20API%20V1.21.1.pdf)

See [HELP.md](./companion/HELP.md) and [LICENSE](./LICENSE)

## Development

Requires Node.js 22 and Yarn (via Corepack).

```sh
yarn install
yarn test          # unit tests (node:test)
yarn lint          # ESLint, using the shared Companion config
yarn format        # format with Prettier
yarn format:check  # check formatting (src and test), as CI does
yarn package       # build the module package
```

CI runs the format check, lint and tests on every pull request.

## Mock Control Box

A mock control box server is provided in the `mock_control_box` directory. It has its own dependencies, so install them first:
```sh
cd mock_control_box
npm install
node main.js
```

This will start a mock server at `127.0.0.1:9001`.

The mock answers the preset list, preset activate, matrix list, matrix activate and device list commands using the files in `mock_control_box/mocks`. Any other command (aset, IR, CEC, video path, etc.) is simply echoed back, so it will not change any routing.
