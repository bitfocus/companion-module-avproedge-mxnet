## AvProEdge MXnet module

In order to connect the following configuration is required:
 * IP Address: The IP address for the IPC control box
 * Telnet Port: The telnet port (default is 24)

Supported commands:
 * *Set Matrix Preset* - Activating this command will switch to the specified matrix preset.
 * *Connect encoder to decoders (matrix aset)* - Allows routing an encoder's output to a set of decoders (video and/of audio routing).
 * *Send IR command* - Send an IR command to the specified device (encoder/decoder).
 * *Send CEC command* - Send a CEC command to the specified device (encoder/decoder).

 Supported feebacks[1]:
 * *Decoder has X video source* - Is the specified decoder being routed the specified video source?

 [1] Feedbacks update after commands sent from Companion. Enable polling in the connection config to also pick up routing changes made elsewhere (for example from the control box web UI).

Variables:
 * `connection_state` - One of `connecting`, `connected`, `disconnected`, `error` or `not configured`.