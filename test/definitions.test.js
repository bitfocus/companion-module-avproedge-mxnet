const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const buildActions = require('../src/actions')
const buildFeedbacks = require('../src/feedbacks')
const { parseDeviceFromRaw } = require('../src/utils')
const deviceListMock = require('../mock_control_box/mocks/config_get_devicelist.json')

const mockDevices = () => Object.values(deviceListMock.info).map(parseDeviceFromRaw)

// Stand-in for the instance: records definitions and the calls made by action callbacks
function stubInstance({ devices = mockDevices(), presets = ['preset_a', 'preset_b'], matrixes = ['mx1', 'mx2'] } = {}) {
	const self = {
		devices,
		calls: [],
		logs: [],
		log: (level, message) => self.logs.push({ level, message }),
		actions: undefined,
		feedbacks: undefined,
		getPresetNames: () => presets,
		getMatrixes: () => matrixes,
		getDevices: () => devices,
		setActionDefinitions: (a) => (self.actions = a),
		setFeedbackDefinitions: (f) => (self.feedbacks = f),
	}
	for (const method of [
		'activateMatrixPreset',
		'activateMatrix',
		'sendMatrixAset',
		'sendIRCommand',
		'sendCECCommand',
		'sendSetVideopath',
	]) {
		self[method] = (...args) => self.calls.push([method, ...args])
	}
	return self
}

const choiceIds = (option) => option.choices.map((c) => c.id)

describe('action definitions', () => {
	const self = stubInstance()
	buildActions(self)

	test('defines the expected actions', () => {
		assert.deepEqual(Object.keys(self.actions).sort(), [
			'send_cec_command',
			'send_ir_command',
			'send_matrix_aset',
			'send_set_videopath',
			'set_matrix',
			'set_matrix_preset',
		])
	})

	test('every action has a name, options and a callback', () => {
		for (const [id, action] of Object.entries(self.actions)) {
			assert.ok(action.name, `${id} has a name`)
			assert.ok(Array.isArray(action.options), `${id} has options`)
			assert.equal(typeof action.callback, 'function', `${id} has a callback`)
		}
	})

	test('every option has a unique id within its action', () => {
		for (const [id, action] of Object.entries(self.actions)) {
			const ids = action.options.map((o) => o.id)
			assert.equal(new Set(ids).size, ids.length, `${id} has duplicate option ids`)
		}
	})

	test('dropdown defaults are one of the choices', () => {
		for (const [id, action] of Object.entries(self.actions)) {
			for (const option of action.options.filter((o) => o.type === 'dropdown')) {
				assert.ok(choiceIds(option).includes(option.default), `${id}.${option.id} default is not a choice`)
			}
		}
	})

	test('encoder and decoder dropdowns only offer the matching device type', () => {
		const aset = self.actions.send_matrix_aset.options
		assert.deepEqual(choiceIds(aset.find((o) => o.id === 'encoder')), ['TX01-VisMain', 'TX02-VisStage'])
		assert.deepEqual(choiceIds(aset.find((o) => o.id === 'decoders')), ['RX01-LED', 'RX02-Left', 'RX03-Right'])
		const path = self.actions.send_set_videopath.options
		assert.deepEqual(choiceIds(path.find((o) => o.id === 'encoder')), ['TX01-VisMain', 'TX02-VisStage'])
	})

	test('IR and CEC offer every device', () => {
		for (const id of ['send_ir_command', 'send_cec_command']) {
			assert.equal(choiceIds(self.actions[id].options.find((o) => o.id === 'device')).length, 5)
		}
	})

	test('multidropdown defaults are arrays', () => {
		for (const [id, action] of Object.entries(self.actions)) {
			for (const option of action.options.filter((o) => o.type === 'multidropdown')) {
				assert.ok(Array.isArray(option.default), `${id}.${option.id} default should be an array`)
			}
		}
	})

	test('preset and matrix dropdowns list what the instance knows about', () => {
		const preset = self.actions.set_matrix_preset.options[0]
		assert.deepEqual(choiceIds(preset), ['preset_a', 'preset_b'])
		assert.equal(preset.default, 'preset_a')
		const matrix = self.actions.set_matrix.options[0]
		assert.deepEqual(choiceIds(matrix), ['mx1', 'mx2'])
		assert.equal(matrix.default, 'mx1')
	})

	test('builds without throwing when nothing has been discovered yet', () => {
		const empty = stubInstance({ devices: [], presets: [], matrixes: [] })
		assert.doesNotThrow(() => buildActions(empty))
		assert.equal(empty.actions.set_matrix_preset.options[0].default, '')
		assert.deepEqual(empty.actions.send_matrix_aset.options[0].choices, [])
	})
})

describe('action callbacks', () => {
	const run = (actionId, options) => {
		const s = stubInstance()
		buildActions(s)
		s.actions[actionId].callback({ options })
		return s.calls
	}

	test('set_matrix_preset', () => {
		assert.deepEqual(run('set_matrix_preset', { preset: 'preset_b' }), [['activateMatrixPreset', 'preset_b']])
	})

	test('set_matrix', () => {
		assert.deepEqual(run('set_matrix', { matrix: 'mx2' }), [['activateMatrix', 'mx2']])
	})

	test('send_matrix_aset', () => {
		const options = { encoder: 'TX01-VisMain', decoders: ['RX01-LED'], sendVideo: true, sendAudio: false }
		assert.deepEqual(run('send_matrix_aset', options), [['sendMatrixAset', 'TX01-VisMain', ['RX01-LED'], true, false]])
	})

	test('send_ir_command and send_cec_command', () => {
		assert.deepEqual(run('send_ir_command', { device: ['RX01-LED'], command: 'POWER' }), [
			['sendIRCommand', ['RX01-LED'], 'POWER'],
		])
		assert.deepEqual(run('send_cec_command', { device: ['RX01-LED'], command: 'on' }), [
			['sendCECCommand', ['RX01-LED'], 'on'],
		])
	})

	test('send_set_videopath', () => {
		assert.deepEqual(run('send_set_videopath', { encoder: 'TX01-VisMain', decoder: 'RX01-LED' }), [
			['sendSetVideopath', 'TX01-VisMain', 'RX01-LED'],
		])
	})

	test('aset with neither video nor audio is not sent', () => {
		const s = stubInstance()
		buildActions(s)
		s.actions.send_matrix_aset.callback({
			options: { encoder: 'TX01-VisMain', decoders: ['RX01-LED'], sendVideo: false, sendAudio: false },
		})
		assert.deepEqual(s.calls, [])
		assert.equal(s.logs[0]?.level, 'warn')
	})

	test('every method an action calls exists on the instance', () => {
		const MXnetInstance = require('../src/instance')
		for (const method of [
			'activateMatrixPreset',
			'activateMatrix',
			'sendMatrixAset',
			'sendIRCommand',
			'sendCECCommand',
			'sendSetVideopath',
		]) {
			assert.equal(typeof MXnetInstance.prototype[method], 'function', `${method} missing on instance`)
		}
	})

	test('every instance method forwarding to the client exists on the client', () => {
		const MxnetClient = require('../src/mxnet/mxnetClient')
		const MXnetInstance = require('../src/instance')
		const forwarded = {
			activateMatrixPreset: 'activateMatrixPreset',
			activateMatrix: 'activateMatrix',
			sendMatrixAset: 'sendMatrixAset',
			sendIRCommand: 'sendIRCommand',
			sendCECCommand: 'sendCECCommand',
			sendSetVideopath: 'sendSetVideopath',
		}
		for (const [instanceMethod, clientMethod] of Object.entries(forwarded)) {
			const calls = []
			const fake = {
				mxnetClient: new Proxy(
					{},
					{
						get:
							(_, name) =>
							(...args) =>
								calls.push([name, ...args]),
					},
				),
			}
			MXnetInstance.prototype[instanceMethod].call(fake, 'a', 'b', true, false)
			assert.equal(calls[0][0], clientMethod)
			assert.equal(typeof MxnetClient.prototype[clientMethod], 'function', `${clientMethod} missing on client`)
		}
	})
})

describe('feedback definitions', () => {
	const self = stubInstance()
	buildFeedbacks(self)
	const feedback = self.feedbacks.videoSource
	const check = (decoder, encoder, devices = self.devices) => {
		self.devices = devices
		return feedback.callback({ options: { decoder, encoder } })
	}

	test('defines videoSource as a boolean feedback with a default style', () => {
		assert.equal(feedback.type, 'boolean')
		assert.ok(feedback.defaultStyle.bgcolor !== undefined)
	})

	test('dropdown defaults are one of the choices', () => {
		for (const option of feedback.options) {
			assert.ok(choiceIds(option).includes(option.default), `${option.id} default is not a choice`)
		}
	})

	test('true when the decoder video channel matches the encoder channel', () => {
		// mock decoders all take video from channel 2, which is TX01-VisMain
		assert.equal(check('RX01-LED', 'TX01-VisMain'), true)
	})

	test('false when the decoder is on a different encoder', () => {
		assert.equal(check('RX01-LED', 'TX02-VisStage'), false)
	})

	test('follows routing changes made after the definition was built', () => {
		const devices = mockDevices()
		devices.find((d) => d.id === 'RX01-LED').source_video_channel = 3
		assert.equal(check('RX01-LED', 'TX02-VisStage', devices), true)
		assert.equal(check('RX01-LED', 'TX01-VisMain', devices), false)
	})

	test('false for unknown devices', () => {
		assert.ok(!check('nope', 'TX01-VisMain'))
		assert.ok(!check('RX01-LED', 'nope'))
	})

	test('builds without throwing when there are no devices', () => {
		const empty = stubInstance({ devices: [] })
		assert.doesNotThrow(() => buildFeedbacks(empty))
		assert.equal(empty.feedbacks.videoSource.options[0].default, '')
	})
})
