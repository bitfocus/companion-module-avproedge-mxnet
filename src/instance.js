const { InstanceBase, InstanceStatus } = require('@companion-module/base')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const ConfigFields = require('./config')
const MxnetClient = require('./mxnet/mxnetClient')
const parseResponse = require('./mxnet/parseResponse')
const {
	arrayEqualsUnordered,
	parseDeviceFromRaw,
	deviceIdAndDescriptionEquals,
	hasAnyDeviceRoutingChanged,
	parsePresetsFromRaw,
	findDeviceById,
} = require('./utils')

class MXnetInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.config = config
		this.mxnetClient = undefined

		// state must exist before anything below builds definitions or starts connecting
		this.presets = []
		this.matrixes = []
		this.devices = []
		this.heartbeatTime = 30_000 // 30 seconds
		this.heartbeatInterval = undefined
		this.pollingInterval = undefined

		this.setVariableDefinitions([{ variableId: 'connection_state', name: 'Connection state' }])
		this.setConnectionState('connecting')
		this.updateStatus(InstanceStatus.Connecting)

		this.updateActions() // export actions
		this.updateFeedbackDefinitions() // export feedbacks

		await this.configUpdated(config)
	}

	// When module gets deleted
	async destroy() {
		this.closeClient()
	}

	// Closes the connection and stops any timers that depend on it
	closeClient() {
		if (this.mxnetClient !== undefined) {
			this.mxnetClient.close()
			this.mxnetClient = undefined
		}

		this.clearAllIntervals()
	}

	// connection_state is one of: connecting, connected, disconnected, error, not configured
	setConnectionState(state) {
		this.connectionState = state
		this.setVariableValues({ connection_state: state })
	}

	initMxnetClient() {
		if (this.mxnetClient !== undefined) {
			this.mxnetClient.close()
		}

		const mxnetOptions = {
			host: this.config.host,
			port: this.config.port || 24,
			log: (level, message) => this.log(level, message),
			onInit: () => this.onInit(),
			onError: (err) => this.onError(err),
			onConnect: () => this.onConnect(),
			onDisconnect: () => this.onDisconnect(),
			onResponse: (jsonData) => this.onResponse(jsonData),
		}
		this.mxnetClient = new MxnetClient(mxnetOptions)
		this.mxnetClient.init()
	}

	onInit() {
		this.clearAllIntervals()
		this.setConnectionState('connecting')
		this.updateStatus(InstanceStatus.Connecting)
	}

	onError(err) {
		this.setConnectionState('error')
		this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
		this.log('error', 'Network error: ' + err.message)
	}

	onDisconnect() {
		this.clearAllIntervals()
		this.setConnectionState('disconnected')
		this.updateStatus(InstanceStatus.Disconnected)
		this.log('info', 'Disconnected from MXnet')
	}

	onConnect() {
		this.setConnectionState('connected')
		this.updateStatus(InstanceStatus.Ok)
		this.log('info', 'Connected')

		this.pollMxnetInfo()

		if (this.config.enablePolling) {
			this.startPollingInterval()
		} else {
			this.startHeartbeatInterval()
		}
	}

	onResponse(jsonData) {
		//this.log('debug', `Processing JSON data: ${JSON.stringify(jsonData)}`);
		// "code":0 means the command succeeded; failures look like {"error":"...","cmd":"...","code":-1}
		if (jsonData?.code !== undefined && jsonData.code !== 0) {
			this.log('warn', `Command failed (code ${jsonData.code}): ${jsonData.cmd} ${jsonData.error ?? ''}`)
			return
		}

		const response = parseResponse(jsonData)
		if (!response) return

		switch (response.type) {
			case 'presetList':
				this.handleMatrixPresetListResponse(response.info)
				break
			case 'matrixList':
				this.handleMatrixListResponse(response.info)
				break
			case 'deviceList':
				this.handleDeviceListResponse(response.info)
				break
			case 'presetActivated':
				this.handleMatrixPresetActivated(response.presetName)
				break
			case 'aset':
				this.handleMatrixAset(response.options, response.encoder, response.decoders)
				break
		}
	}

	activateMatrixPreset(presetName) {
		this.mxnetClient?.activateMatrixPreset(presetName)
	}

	activateMatrix(matrixName) {
		this.mxnetClient?.activateMatrix(matrixName)
	}

	sendMatrixAset(encoderId, decoderIds, sendVideo, sendAudio) {
		this.mxnetClient?.sendMatrixAset(encoderId, decoderIds, sendVideo, sendAudio)
	}

	sendIRCommand(deviceId, command) {
		this.mxnetClient?.sendIRCommand(deviceId, command)
	}

	sendCECCommand(deviceId, command) {
		this.mxnetClient?.sendCECCommand(deviceId, command)
	}

	sendSetVideopath(encoderId, decoderId) {
		this.mxnetClient?.sendSetVideopath(encoderId, decoderId)
	}

	handleMatrixPresetListResponse(info) {
		const newPresetNames = Object.keys(info)
		newPresetNames.sort()
		const oldPresetNames = this.getPresetNames()

		// routing is kept up to date for feedbacks, but the action dropdowns only depend on the names
		this.presets = parsePresetsFromRaw(info)

		if (!arrayEqualsUnordered(oldPresetNames, newPresetNames)) {
			this.log('info', `Matrix preset list updated: ${newPresetNames}`)
			this.updateActions()
		}
	}

	handleMatrixPresetActivated(presetName) {
		this.log('info', `Matrix preset activated: ${presetName}`)

		const presetRouting = this.presets.find((p) => p.name === presetName)?.routing
		if (presetRouting) {
			Object.keys(presetRouting).forEach((deviceId) => {
				const presetDeviceRouting = presetRouting[deviceId]
				const device = findDeviceById(this.devices, deviceId)
				if (device) {
					device.source_video_channel = presetDeviceRouting.source_video_channel
					device.source_audio_channel = presetDeviceRouting.source_audio_channel
				}
			})

			this.checkFeedbacks()
		}
	}

	handleMatrixAset(options, encoder, decoders) {
		this.log('info', `Matrix aset command completed: ${options}, encoder: ${encoder}, decoders: ${decoders}`)
		const encoderDevice = findDeviceById(this.devices, encoder)
		if (encoderDevice) {
			decoders.forEach((decoderId) => {
				const decoderDevice = findDeviceById(this.devices, decoderId)
				if (decoderDevice) {
					if (options.includes('v')) {
						decoderDevice.source_video_channel = encoderDevice.channel
					}
					if (options.includes('a')) {
						decoderDevice.source_audio_channel = encoderDevice.channel
					}
				}
			})

			this.checkFeedbacks()
		}
	}

	handleMatrixListResponse(info) {
		const newMatrixNames = Object.keys(info)
		newMatrixNames.sort()

		if (!arrayEqualsUnordered(this.matrixes, newMatrixNames)) {
			this.matrixes = newMatrixNames
			this.log('info', `Matrix list updated: ${newMatrixNames}`)
			this.updateActions()
		}
	}

	handleDeviceListResponse(info) {
		const newDevices = Object.keys(info).map((id) => parseDeviceFromRaw(info[id]))
		newDevices.sort((a, b) => a.description.localeCompare(b.description))

		if (!deviceIdAndDescriptionEquals(this.devices, newDevices)) {
			this.devices = newDevices
			this.log('info', `Device list updated: ${newDevices.map((d) => d.description)}`)
			this.updateActions()
			this.updateFeedbackDefinitions()
		} else if (hasAnyDeviceRoutingChanged(this.devices, newDevices)) {
			this.devices = newDevices
			this.log('info', `Device routing updated`)
		}

		this.checkFeedbacks()
	}

	getPresets() {
		return this.presets
	}

	getPresetNames() {
		const presetNames = (this.presets || []).map((p) => p.name)
		presetNames.sort()
		return presetNames
	}

	getMatrixes() {
		return this.matrixes
	}

	getDevices() {
		return this.devices
	}

	clearAllIntervals() {
		if (this.heartbeatInterval !== undefined) {
			clearInterval(this.heartbeatInterval)
			this.heartbeatInterval = undefined
			this.log('debug', 'Heartbeat interval destroyed')
		}

		if (this.pollingInterval !== undefined) {
			clearInterval(this.pollingInterval)
			this.pollingInterval = undefined
			this.log('debug', 'Polling interval destroyed')
		}
	}

	startHeartbeatInterval() {
		this.heartbeatInterval = setInterval(() => this.mxnetClient.sendHeartbeatCommand(), this.heartbeatTime)
	}

	startPollingInterval() {
		this.heartbeatInterval = setInterval(() => this.pollMxnetInfo(), this.config.pollingInterval || 5000)
	}

	pollMxnetInfo() {
		// TODO: API v1.21.1 added `config get device routes [v,a,u,r,s] [DecID/DecMAC]`, which should be a
		// lighter way to refresh routing than fetching the full device list on every poll
		this.mxnetClient.pollMatrixPresets()
		this.mxnetClient.pollMatrixes()
		this.mxnetClient.pollDevices()
	}

	async configUpdated(config) {
		const resetConnection = this.config != config

		this.config = config

		if (!config.host) {
			this.closeClient()
			this.setConnectionState('not configured')
			this.updateStatus(InstanceStatus.BadConfig, 'No host configured')
			return
		}

		if (resetConnection || this.mxnetClient === undefined) {
			this.initMxnetClient()
		}
	}

	// Return config fields for web config
	getConfigFields() {
		return ConfigFields
	}

	updateActions() {
		UpdateActions(this)
	}

	updateFeedbackDefinitions() {
		UpdateFeedbacks(this)
	}
}

module.exports = MXnetInstance
