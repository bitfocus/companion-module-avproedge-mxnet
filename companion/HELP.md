## AvProEdge MXnet module

Controls an AVPro Edge MXnet system through the telnet API of the IPC control box.

### Configuration

- **IP Address**: The IP address of the IPC control box (required).
- **Telnet Port**: The telnet port (default is 24).
- **Enable polling**: Periodically reads the preset list, matrix list and device list from the control box so that action dropdowns and feedbacks stay in sync with changes made outside Companion, for example in the control box web UI. When polling is off, the module sends a keep-alive instead and only reads the lists when it connects.
- **Polling interval (ms)**: How often to poll (default is 5000).

### Actions

- _Set matrix preset_ - Activates the selected matrix preset.
- _Set matrix_ - Activates the selected matrix.
- _Connect encoder to decoders (matrix aset)_ - Routes an encoder to one or more decoders. Choose whether to route video, audio, or both; at least one is required.
- _Set video path_ - Routes video from an encoder to a decoder.
- _Send IR command_ - Sends an IR code to one or more devices (encoders or decoders). The code can be in Pronto or Global Cache format.
- _Send CEC command_ - Sends CEC data to one or more devices (encoders or decoders). Use hex data such as `0036`, several values separated by commas, or `poweron` / `poweroff`.

The preset, matrix and device dropdowns are filled from the control box, so they stay empty until the module has connected.

### Feedbacks

- _Decoder has X video source_ - True when the selected decoder is receiving video from the selected encoder.

The module updates its routing state when it receives the control box's reply to _Connect encoder to decoders_ and _Set matrix preset_, and from every device list read. Other routing actions (_Set matrix_ and _Set video path_) are picked up on the next poll, so enable polling if you use them with feedbacks.

### Variables

- `connection_state` - One of `connecting`, `connected`, `disconnected`, `error` or `not configured`.

### Status

If no IP address is set, the connection shows a bad config status and the module does not connect. Commands that fail on the control box (a non-zero `code` in its reply) are logged as warnings and do not change the module's routing state.
