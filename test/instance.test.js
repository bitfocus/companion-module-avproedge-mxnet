const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const MXnetInstance = require('../src/instance')
const deviceListMock = require('../mock_control_box/mocks/config_get_devicelist.json')
const presetListMock = require('../mock_control_box/mocks/matrix_preset_list.json')

// Build an instance without a Companion host or a real connection, recording the calls we care about
function makeInstance(config = { enablePolling: true }) {
	const inst = Object.create(MXnetInstance.prototype)
	inst.config = config
	inst.presets = []
	inst.matrixes = []
	inst.devices = []
	inst.calls = { updateActions: 0, updateFeedbackDefinitions: 0, checkFeedbacks: 0 }
	inst.logs = []
	inst.log = (level, message) => inst.logs.push({ level, message })
	inst.updateStatus = () => {}
	inst.initMxnetClient = () => {}
	inst.updateActions = () => inst.calls.updateActions++
	inst.updateFeedbackDefinitions = () => inst.calls.updateFeedbackDefinitions++
	inst.checkFeedbacks = () => inst.calls.checkFeedbacks++
	return inst
}

const clone = (obj) => JSON.parse(JSON.stringify(obj))

describe('init', () => {
	test('state exists before definitions are built or the connection starts', async () => {
		const inst = makeInstance()
		delete inst.presets
		delete inst.matrixes
		delete inst.devices
		let snapshot
		inst.updateActions = () => (snapshot ??= { presets: inst.presets, matrixes: inst.matrixes, devices: inst.devices })
		inst.initMxnetClient = () => {
			inst.stateAtConnect = { presets: inst.presets, heartbeatTime: inst.heartbeatTime }
		}

		await inst.init({ enablePolling: true })

		assert.deepEqual(snapshot, { presets: [], matrixes: [], devices: [] })
		assert.deepEqual(inst.stateAtConnect, { presets: [], heartbeatTime: 30_000 })
	})
})

describe('matrix preset list', () => {
	test('first list updates actions', () => {
		const inst = makeInstance()
		inst.handleMatrixPresetListResponse(presetListMock.info)
		assert.equal(inst.calls.updateActions, 1)
		assert.deepEqual(inst.getPresetNames(), ['mock_matrix_preset_1', 'mock_matrix_preset_2', 'mock_matrix_preset_3'])
	})

	test('an unchanged list on the next poll does not rebuild actions', () => {
		const inst = makeInstance()
		inst.handleMatrixPresetListResponse(presetListMock.info)
		inst.handleMatrixPresetListResponse(clone(presetListMock.info))
		assert.equal(inst.calls.updateActions, 1)
	})

	test('changed routing inside a preset is stored without rebuilding actions', () => {
		const inst = makeInstance()
		inst.handleMatrixPresetListResponse(presetListMock.info)
		const changed = clone(presetListMock.info)
		changed.mock_matrix_preset_1['RX01-LED'].ch_v = '7'
		inst.handleMatrixPresetListResponse(changed)
		assert.equal(inst.calls.updateActions, 1)
		const preset = inst.getPresets().find((p) => p.name === 'mock_matrix_preset_1')
		assert.equal(preset.routing['RX01-LED'].source_video_channel, 7)
	})

	test('an added or removed preset rebuilds actions', () => {
		const inst = makeInstance()
		inst.handleMatrixPresetListResponse(presetListMock.info)
		const added = { ...clone(presetListMock.info), extra: {} }
		inst.handleMatrixPresetListResponse(added)
		assert.equal(inst.calls.updateActions, 2)
		inst.handleMatrixPresetListResponse(presetListMock.info)
		assert.equal(inst.calls.updateActions, 3)
	})
})

describe('device list', () => {
	test('a new device list rebuilds actions and feedback definitions', () => {
		const inst = makeInstance()
		inst.handleDeviceListResponse(deviceListMock.info)
		assert.equal(inst.calls.updateActions, 1)
		assert.equal(inst.calls.updateFeedbackDefinitions, 1)
		assert.equal(inst.devices.length, 5)
	})

	test('feedbacks are checked whether or not polling is enabled', () => {
		for (const enablePolling of [true, false]) {
			const inst = makeInstance({ enablePolling })
			inst.handleDeviceListResponse(deviceListMock.info)
			assert.equal(inst.calls.checkFeedbacks, 1, `enablePolling=${enablePolling}`)
		}
	})

	test('an unchanged list does not rebuild definitions', () => {
		const inst = makeInstance()
		inst.handleDeviceListResponse(deviceListMock.info)
		inst.handleDeviceListResponse(clone(deviceListMock.info))
		assert.equal(inst.calls.updateActions, 1)
		assert.equal(inst.calls.updateFeedbackDefinitions, 1)
		assert.equal(inst.calls.checkFeedbacks, 2)
	})

	test('a routing-only change updates devices without rebuilding definitions', () => {
		const inst = makeInstance()
		inst.handleDeviceListResponse(deviceListMock.info)
		const changed = clone(deviceListMock.info)
		changed['RX01-LED'].ch_v = '0003'
		inst.handleDeviceListResponse(changed)
		assert.equal(inst.calls.updateActions, 1)
		assert.equal(inst.devices.find((d) => d.id === 'RX01-LED').source_video_channel, 3)
	})
})

describe('routing updates from command responses', () => {
	const withDevices = () => {
		const inst = makeInstance()
		inst.handleDeviceListResponse(deviceListMock.info)
		inst.calls.checkFeedbacks = 0
		return inst
	}
	const decoderOf = (inst, id) => inst.devices.find((d) => d.id === id)

	test('aset with video only changes the video source', () => {
		const inst = withDevices()
		inst.handleMatrixAset('v', 'TX02-VisStage', ['RX01-LED', 'RX02-Left'])
		assert.equal(decoderOf(inst, 'RX01-LED').source_video_channel, 3)
		assert.equal(decoderOf(inst, 'RX02-Left').source_video_channel, 3)
		assert.equal(decoderOf(inst, 'RX03-Right').source_video_channel, 2)
		assert.equal(decoderOf(inst, 'RX01-LED').source_audio_channel, 3) // unchanged mock value
		assert.equal(inst.calls.checkFeedbacks, 1)
	})

	test('aset with audio only changes the audio source', () => {
		const inst = withDevices()
		inst.handleMatrixAset('a', 'TX01-VisMain', ['RX01-LED'])
		assert.equal(decoderOf(inst, 'RX01-LED').source_audio_channel, 2)
		assert.equal(decoderOf(inst, 'RX01-LED').source_video_channel, 2)
	})

	test('aset for an unknown encoder changes nothing', () => {
		const inst = withDevices()
		inst.handleMatrixAset('va', 'nope', ['RX01-LED'])
		assert.equal(inst.calls.checkFeedbacks, 0)
	})

	test('preset activation applies the preset routing to known decoders', () => {
		const inst = withDevices()
		inst.handleMatrixPresetListResponse(presetListMock.info)
		inst.handleMatrixPresetActivated('mock_matrix_preset_2')
		assert.equal(decoderOf(inst, 'RX01-LED').source_video_channel, 3)
		assert.equal(inst.calls.checkFeedbacks, 1)
	})

	test('activating an unknown preset changes nothing', () => {
		const inst = withDevices()
		inst.handleMatrixPresetActivated('nope')
		assert.equal(inst.calls.checkFeedbacks, 0)
	})
})

describe('response codes', () => {
	const withDevices = () => {
		const inst = makeInstance()
		inst.handleDeviceListResponse(deviceListMock.info)
		inst.handleMatrixPresetListResponse(presetListMock.info)
		inst.calls.checkFeedbacks = 0
		return inst
	}
	const decoderOf = (inst, id) => inst.devices.find((d) => d.id === id)
	const failure = (cmd) => ({ error: 'No device: nope', cmd, code: -1, gid: 200000 })

	test('a successful aset updates local routing', () => {
		const inst = withDevices()
		inst.onResponse({ cmd: 'matrix aset :v TX02-VisStage RX01-LED', info: 'OK', code: 0 })
		assert.equal(decoderOf(inst, 'RX01-LED').source_video_channel, 3)
		assert.equal(inst.calls.checkFeedbacks, 1)
	})

	test('a failed aset leaves local routing alone and logs a warning', () => {
		const inst = withDevices()
		inst.onResponse(failure('matrix aset :v TX02-VisStage RX01-LED'))
		assert.equal(decoderOf(inst, 'RX01-LED').source_video_channel, 2)
		assert.equal(inst.calls.checkFeedbacks, 0)
		assert.equal(inst.logs.at(-1).level, 'warn')
		assert.match(inst.logs.at(-1).message, /code -1.*No device: nope/)
	})

	test('a failed preset activation leaves local routing alone', () => {
		const inst = withDevices()
		inst.onResponse(failure('matrix preset active mock_matrix_preset_2'))
		assert.equal(decoderOf(inst, 'RX01-LED').source_video_channel, 2)
		assert.equal(inst.calls.checkFeedbacks, 0)
	})

	test('a failed list command does not throw or change state', () => {
		const inst = withDevices()
		const updates = inst.calls.updateActions
		assert.doesNotThrow(() => inst.onResponse(failure('config get devicelist')))
		assert.doesNotThrow(() => inst.onResponse(failure('matrix preset list')))
		assert.equal(inst.devices.length, 5)
		assert.equal(inst.calls.updateActions, updates)
	})

	test('a failed response for a command we do not track is still logged', () => {
		const inst = withDevices()
		inst.onResponse(failure('config set device ir 0000 0068 nope'))
		assert.equal(inst.logs.at(-1).level, 'warn')
	})

	test('a response without a code field is treated as success', () => {
		const inst = withDevices()
		inst.onResponse({ cmd: 'matrix preset active mock_matrix_preset_2' })
		assert.equal(decoderOf(inst, 'RX01-LED').source_video_channel, 3)
	})
})
