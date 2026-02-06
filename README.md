# companion-module-avproedge-mxnet

This is a module for controlling an [AvProEdge MXnet](https://www.avproglobal.com/pages/mxnet) network.

The following docs have been used for reference:
 * [How to use the MXNET API](./docs/support/How%20to%20use%20the%20MXNET%20API%206-21-2021.pdf)
 * [IPCBox API](./docs/support/IPCBox%20API%20V1.21.1.pdf)

See [HELP.md](./companion/HELP.md) and [LICENSE](./LICENSE)

## Mock Control Box

A mock control box server is provided in the `mock_control_box` directory. The mock server can be started with the following:
```sh
cd mock_control_box
node main.js
```

This will start a mock server at `127.0.0.1:9001`.