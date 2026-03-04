const JSONParser = require('@streamparser/json')
const { TelnetHelper } = require('@companion-module/base')

class MxnetClient {
    constructor(options) {
        this.socket = undefined;
        this.log = (level, message) => console.log(message); // TODO: replace with createModuleLogger when available));

        this.host = options.host;
        this.port = options.port;
        this.onInit = options.onInit;
        this.onError = options.onError;
        this.onConnect = options.onConnect;
        this.onResponse = options.onResponse;
    }

    init() {
        const self = this;
        self.onInit();

        const responseParser = new JSONParser.JSONParser({ separator: '', paths: ['$'] });
        responseParser.onValue = (value) => {
            if (value.stack.length == 0) { // ignore inner values
		        self.onResponse(value.value);
            }
        };

        if (self.socket !== undefined) {
			self.socket.destroy();
			self.socket = undefined;
		}

        self.log('info', `Connecting to MXnet at ${self.host}:${self.port}...`);
        self.socket = new TelnetHelper(self.host, self.port)
                    
        self.socket.on('error', (err) => {
            self.onError(err);
            // self.updateStatus(InstanceStatus.ConnectionFailure, err.message)
            // self.log('error', "Network error: " + err.message)
        })
        
        self.socket.on('connect', () => {
            self.onConnect();
            // self.updateStatus(InstanceStatus.Ok)
            // self.log('info', "Connected")

            // self.startHeartbeatInterval()
            // self.pollMatrixPresets()
            // self.pollMatrixes()
            // self.pollDevices()
        })
        
        self.socket.on('end', () => {
            self.log('info', 'Telnet connection closed. Recommecting...');
            self.init()
        })

        self.socket.on('data', (chunk) => {
            responseParser.write(chunk.toString("utf8"));
        })
    }

	sendCommand(command) {
		try {
			this.socket.send(`${command}\r\n`);
		} catch (error) {
			this.log('error', 'Error sending command: ' + error)
			this.init();
		}
	}

    close() {
        if (this.socket !== undefined) {
            this.socket.destroy();
            this.socket = undefined;
        }
    }
	
	pollMatrixPresets() {
		this.log('debug', 'Polling matrix preset list')
		this.sendCommand("matrix preset list")
	}

	pollMatrixes() {
		this.log('debug', 'Polling matrix list')
		this.sendCommand("matrix list")
	}

	pollDevices() {
		this.log('debug', 'Polling devices')
		this.sendCommand("config get devicelist");
	}

	activateMatrixPreset(preset) {
		this.log('debug', `Activating matrix preset: ${preset}`)
		this.sendCommand(`matrix preset active ${preset}`)
	}

	activateMatrix(matrix) {
		this.log('debug', `Activating matrix: ${matrix}`)
		this.sendCommand(`matrix active ${matrix}`)
	}

	sendIRCommand(devices, command) {
		this.log('debug', `Sending IR command to device [${devices}]: ${command}`)
		this.sendCommand(`config set device ir ${command} ${Array.isArray(devices) ? devices.join(',') : devices}`)
	}

	sendCECCommand(devices, command) {
		this.log('debug', `Sending CEC command to device [${devices}]: ${command}`)
		this.sendCommand(`config set device cec ${command} ${Array.isArray(devices) ? devices.join(':') : devices}`)
	}

	sendSetVideopath(encoder, decoder) {
		this.log('debug', `Setting videopath from encoder ${encoder} to decoder ${decoder}`);
		this.sendCommand(`config set device videopath ${encoder} ${decoder}`)
	}

	sendMatrixAset(encoder, decoders, sendVideo, sendAudio) {
		this.log('debug', `Sending matrix aset from encoder ${encoder} to decoders ${decoders}`);
		this.sendCommand(`matrix aset :${sendVideo ? 'v':''}${sendAudio ? 'a':''} ${encoder} ${Array.isArray(decoders) ? decoders.join(' ') : decoders}`)
	}

	sendHeartbeatCommand() {
        this.log('debug', 'HEARTBEAT')
	    //Send new line to keep connection alive
		this.sendCommand("")
	}
};

module.exports = MxnetClient;