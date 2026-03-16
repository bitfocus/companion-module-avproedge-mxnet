const JSONParser = require('@streamparser/json')
const { InstanceBase, Regex, runEntrypoint, InstanceStatus, TelnetHelper } = require('@companion-module/base')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const ConfigFields = require('./config')
const MxnetClient = require('./mxnet/mxnetClient');
const { arraysEqual, arrayEqualsUnordered, parseDeviceFromRaw, deviceIdAndDescriptionEquals, hasAnyDeviceRoutingChanged, parsePresetsFromRaw, findDeviceById } = require('./utils');

class MXnetInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.config = config;
		this.mxnetClient = undefined;

		this.updateStatus(InstanceStatus.Connecting)

		this.updateActions(); // export actions
		this.updateFeedbackDefinitions(); // export feedbacks

		await this.configUpdated(config)

		this.presets = [];
		this.matrixes = [];
		this.devices = [];
		this.heartbeatTime = 30_000; // 30 seconds
		this.heartbeatInterval = undefined;
		this.pollingInterval = undefined;
	}

	// When module gets deleted
	async destroy() {
		if (this.mxnetClient !== undefined) {
			this.mxnetClient.close();
		}
		
		this.clearAllIntervals();
	}

	initMxnetClient() {
		if (this.mxnetClient !== undefined) {
			this.mxnetClient.close();
		}

		const mxnetOptions = {
			host: this.config.host || 'localhost',
			port: this.config.port || 24,
			onInit: () => this.onInit(),
			onError: (err) => this.onError(err),
			onConnect: () => this.onConnect(),
			onResponse: (jsonData) => this.onResponse(jsonData),
		};
		this.mxnetClient = new MxnetClient(mxnetOptions);
		this.mxnetClient.init();
	}

	onInit() {
		this.clearAllIntervals();
		this.updateStatus(InstanceStatus.Connecting)
		this.log('info', "Connecting to MXnet")
	}

	onError(err) {
		this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
		this.log('error', "Network error: " + err.message)
	}

	onConnect() {
		this.updateStatus(InstanceStatus.Ok)
		this.log('info', "Connected")

		this.pollMxnetInfo();

		if (this.config.enablePolling) {
			this.startPollingInterval();
		} else {
			this.startHeartbeatInterval();
		}
	}

	onResponse(jsonData) {
		//this.log('debug', `Processing JSON data: ${JSON.stringify(jsonData)}`);
		const MATRIX_PRESET_ACTIVE_COMMAND = /matrix preset active ([a-zA-Z0-9\\-_]+)$/;
		const MATRIX_ASET_COMMAND = /matrix aset :([av]+) ([a-zA-Z0-9\-_]+) ([a-zA-Z0-9 \-_]+)$/;

		const cmd = jsonData.cmd;

		if (cmd === 'matrix preset list') {
			this.handleMatrixPresetListResponse(jsonData.info);
		} else if (cmd === 'matrix list') {
			this.handleMatrixListResponse(jsonData.info);
		} else if (cmd === 'config get devicelist') {
			this.handleDeviceListResponse(jsonData.info);
		} else if (MATRIX_PRESET_ACTIVE_COMMAND.test(cmd)) {
			const presetName = cmd.match(MATRIX_PRESET_ACTIVE_COMMAND)[1];
			this.handleMatrixPresetActivated(presetName);
		} else if (MATRIX_ASET_COMMAND.test(cmd)) {
			const matchParts = cmd.match(MATRIX_ASET_COMMAND);
			const options = matchParts[1];
			const encoder = matchParts[2];
			const decoders = matchParts[3].split(' ');
			this.handleMatrixAset(options, encoder, decoders);
		}
	}

	activateMatrixPreset(presetName) {
		this.mxnetClient.activateMatrixPreset(presetName);
	}

	activateMatrix(matrixName) {
		this.mxnetClient.activateMatrix(matrixName);
	}

	sendMatrixAset(encoderId, decoderIds, sendVideo, sendAudio) {
		this.mxnetClient.sendMatrixAset(encoderId, decoderIds, sendVideo, sendAudio);
	}

	sendIRCommand(deviceId, command) {
		this.mxnetClient.sendIRCommand(deviceId, command);
	}

	sendCECCommand(deviceId, command) {
		this.mxnetClient.sendCECCommand(deviceId, command);
	}

	sendSetVideopathCommand(deviceId, videopath) {
		this.mxnetClient.sendSetVideopathCommand(deviceId, videopath);
	}

	handleMatrixPresetListResponse(info) {
		const newPresetNames = Object.keys(info);
		newPresetNames.sort();
		const newPresets = parsePresetsFromRaw(info);

		this.presets = newPresets;
		this.log('info', `Matrix preset list updated: ${newPresetNames}`);
		this.updateActions();
	}

	handleMatrixPresetActivated(presetName) {
		this.log('info', `Matrix preset activated: ${presetName}`);

		const presetRouting = this.presets.find(p => p.name === presetName)?.routing;
		if (presetRouting) {
			Object.keys(presetRouting).forEach(deviceId => {
				const presetDeviceRouting = presetRouting[deviceId];
				const device = findDeviceById(this.devices, deviceId);
				if (device) {
					device.source_video_channel = presetDeviceRouting.source_video_channel;
					device.source_audio_channel = presetDeviceRouting.source_audio_channel;
				}
			});

			this.checkFeedbacks();
		}
	}

	handleMatrixAset(options, encoder, decoders) {
		this.log('info', `Matrix aset command completed: ${options}, encoder: ${encoder}, decoders: ${decoders}`);
		const encoderDevice = findDeviceById(this.devices, encoder);
		if (encoderDevice) {
			decoders.forEach(decoderId => {
				const decoderDevice = findDeviceById(this.devices, decoderId);
				if (decoderDevice) {
					if (options.includes('v')) {
						decoderDevice.source_video_channel = encoderDevice.channel;
					}
					if (options.includes('a')) {
						decoderDevice.source_audio_channel = encoderDevice.channel;
					}
				}
			});

			this.checkFeedbacks();
		}
	}

	handleMatrixListResponse(info) {
		const newMatrixNames = Object.keys(info);
		newMatrixNames.sort();

		if (!arrayEqualsUnordered(this.matrixes, newMatrixNames)) {
			this.matrixes = newMatrixNames;
			this.log('info', `Matrix list updated: ${newMatrixNames}`)
			this.updateActions();
		}
	}

	handleDeviceListResponse(info) {
		const newDevices = Object.keys(info)
			.map(id => parseDeviceFromRaw(info[id]));
		newDevices.sort((a, b) => a.description.localeCompare(b.description));

		if (!deviceIdAndDescriptionEquals(this.devices, newDevices)) {
			this.devices = newDevices;
			this.log('info', `Device list updated: ${newDevices.map(d => d.description)}`);
			this.updateActions();
			this.updateFeedbackDefinitions();
		} else if (hasAnyDeviceRoutingChanged(this.devices, newDevices)) {
			this.devices = newDevices;
			this.log('info', `Device routing updated`);
		}

		if (this.config.enablePolling) {
			this.checkFeedbacks();
		}
	}

	getPresets() {
		return this.presets;
	}

	getPresetNames() {
		const presetNames = (this.presets || []).map(p => p.name);
		presetNames.sort();
		return presetNames;
	}

	getMatrixes() {
		return this.matrixes;
	}

	getDevices() {
		return this.devices;
	}

	clearAllIntervals() {
		if (this.heartbeatInterval !== undefined) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = undefined
			this.log('debug', 'Heartbeat interval destroyed');
		}

		if (this.pollingInterval !== undefined) {
			clearInterval(this.pollingInterval);
			this.pollingInterval = undefined;
			this.log('debug', 'Polling interval destroyed');
		}
	}

	startHeartbeatInterval() {
		this.heartbeatInterval = setInterval(
			() => this.mxnetClient.sendHeartbeatCommand(),
			this.heartbeatTime
		);
	}

	startPollingInterval() {
		this.heartbeatInterval = setInterval(
			() => this.pollMxnetInfo(),
			this.config.pollingInterval || 5000
		);
	}

	pollMxnetInfo() {
		this.mxnetClient.pollMatrixPresets();
		this.mxnetClient.pollDevices();

		//update actions (if changes)
	}

	async configUpdated(config) {
		const resetConnection = this.config != config;

		this.config = config;

		if (resetConnection || this.mxnetClient === undefined) {
			this.initMxnetClient();
		}
	}

	// Return config fields for web config
	getConfigFields() {
		return ConfigFields;
	}

	updateActions() {
		UpdateActions(this);
	}

	updateFeedbackDefinitions() {
		UpdateFeedbacks(this);
	}
}

runEntrypoint(MXnetInstance, [])
