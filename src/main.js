const JSONParser = require('@streamparser/json')
const { InstanceBase, Regex, runEntrypoint, InstanceStatus, TelnetHelper } = require('@companion-module/base')
const UpdateActions = require('./actions')
const ConfigFields = require('./config')

class MXnetInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.config = config

		this.updateStatus(InstanceStatus.Ok)

		this.updateActions() // export actions

		await this.configUpdated(config)

		this.presets = []
		this.matrixes = []
		this.devices = []
		this.heartbeatTime = 30
		this.heartbeatInterval = undefined
	}
	// When module gets deleted
	async destroy() {
		this.log('debug', 'destroy')

		if (this.socket !== undefined) {
			this.socket.destroy()
		}
		
		if (this.heartbeatInterval !== undefined) {
			clearInterval(this.heartbeatInterval)
		}
	}

	getPresets() {
		return this.presets;
	}

	getMatrixes() {
		return this.matrixes;
	}

	getDevices() {
		return this.devices;
	}

	//Initialise the Telnet socket
	init_telnet() {
		const self = this


		const responseParser = new JSONParser.JSONParser({ separator: '', paths: ['$'] });
		responseParser.onValue = (value) => {
			self.responseParserOnValue(value.value, value.key, value.parent, value.stack)
		};

		self.updateStatus(InstanceStatus.Connecting)
		self.log('info', "Connecting to MXnet")

		const clearHeartbeat = () => {
			if (self.heartbeatInterval !== undefined){
				clearInterval(self.heartbeatInterval)
				self.heartbeatInterval = undefined
				self.log('debug', 'Heartbeat Destroyed')
			}
		}

		const startHeartbeat = () => {
			self.heartbeatInterval = setInterval(
				self.sendHeartbeatCommand.bind(self),
				(self.heartbeatTime*1000)
			)
		}

		if (self.socket !== undefined) {
			self.socket.destroy()
			self.socket = undefined
		}

		clearHeartbeat()

		if (self.config.port === undefined){
			self.config.port = 24
		}

		if (self.config.host) {
			self.socket = new TelnetHelper(self.config.host, self.config.port)
			
			self.socket.on('error', (err) => {
				self.updateStatus(InstanceStatus.ConnectionFailure, err.message)
				self.log('error', "Network error: " + err.message)
			})
			
			self.socket.on('connect', () => {
				self.updateStatus(InstanceStatus.Ok)
				self.log('info', "Connected")

				startHeartbeat()
				self.pollMatrixPresets()
				self.pollMatrixes()
				self.pollDevices()
			})
			
			self.socket.on('end', () => {
				self.log('info', 'Disconnected')
				self.init_telnet()
			})

			self.socket.on('data', (chunk) => {
				// this.log('debug', chunk.toString("utf8"));
				responseParser.write(chunk.toString("utf8"));
			})
		}
	}

	responseParserOnValue(value, key, parent, stack) {
		//this.log('debug', `responseParserOnValue called with value: [${JSON.stringify(value)}], key: [${key}], parent: [${JSON.stringify(parent)}], stack: [${JSON.stringify(stack)}]`);
		if (stack.length > 0) return; // ignore inner values
		
		this.processJson(value)
	}

	//Processes lines recieved
	processLine(line) {
		this.log('debug', 'Received: ' + line)

		if (line[0] === '{') {
			try {
				let jsonData = JSON.parse(line)
				this.processJson(jsonData)
			} catch (error) {
				this.log('error', 'Error parsing JSON: ' + error)
			}
		}
	}

	isJsonString(str) {
		try {
			JSON.parse(str);
			return true;
		} catch (e) {
			return false;
		}
	}

	processJson(jsonData) {
		this.log('debug', `Processing JSON data: ${JSON.stringify(jsonData)}`);

		const cmd = jsonData.cmd;

		if (cmd === 'matrix preset list') {
			this.presets = Object.keys(jsonData.info)
			this.log('info', `Preset list updated: ${this.presets}`)
			this.updateActions()
		} else if (cmd === 'matrix list') {
			this.matrixes = Object.keys(jsonData.info)
			this.log('info', `Matrix list updated: ${this.matrixes}`)
			this.updateActions()
		} else if (cmd === 'config get devicelist') {
			this.devices = this.parseDeviceList(jsonData.info);
			this.log('info', `Device list updated: ${JSON.stringify(this.devices, null, 2)}`)
			this.updateActions()
		}
	}

	parseDeviceList(deviceList) {
		const deviceIds = Object.keys(deviceList);
		return deviceIds.map(id => {
			const device = deviceList[id];
			return {
				id: id,
				description: device.description || id,
				type: !!device.is_host ? 'encoder' : 'decoder'
			};
		});
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
		this.sendCommand(`config set device ir ${command} ${devices.join(',')}`)
	}

	sendCECCommand(devices, command) {
		this.log('debug', `Sending CEC command to device [${devices}]: ${command}`)
		this.sendCommand(`config set device cec ${command} ${devices.join(':')}`)
	}

	sendSetVideopath(encoder, decoder) {
		this.log('debug', `Setting videopath from encoder ${encoder} to decoder ${decoder}`);
		this.sendCommand(`config set device videopath ${encoder} ${decoder}`)
	}

	sendMatrixAset(encoder, decoders, sendVideo, sendAudio) {
		this.log('debug', `Sending matrix aset from encoder ${encoder} to decoders ${decoders}`);
		this.sendCommand(`matrix aset :${sendVideo ? 'v':''}${sendAudio ? 'a':''} ${encoder} ${decoders.join(' ')}`)
	}

	//Send new line to keep connection alive
	sendHeartbeatCommand() {
		this.log('debug', 'HEARTBEAT')
		this.sendCommand("")
	}

	sendCommand(command) {
		try {
			this.socket.send(`${command}\r\n`);
		} catch (error) {
			this.log('error', 'Error sending command: ' + error)
			this.init_telnet();
		}
	}

	async configUpdated(config) {
		let resetConnection = this.config != config

		this.config = config

		if (resetConnection || this.socket === undefined) {
			this.init_telnet()
		}
	}

	// Return config fields for web config
	getConfigFields() {
		return ConfigFields;
	}

	updateActions() {
		UpdateActions(this)
	}
}

runEntrypoint(MXnetInstance, [])
