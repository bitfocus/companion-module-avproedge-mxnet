const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const parseResponse = require('../src/mxnet/parseResponse')
const deviceListMock = require('../mock_control_box/mocks/config_get_devicelist.json')
const presetListMock = require('../mock_control_box/mocks/matrix_preset_list.json')
const matrixListMock = require('../mock_control_box/mocks/matrix_list.json')

describe('parseResponse', () => {
	test('list responses carry their info payload', () => {
		assert.deepEqual(parseResponse(presetListMock), { type: 'presetList', info: presetListMock.info })
		assert.deepEqual(parseResponse(matrixListMock), { type: 'matrixList', info: matrixListMock.info })
		assert.deepEqual(parseResponse(deviceListMock), { type: 'deviceList', info: deviceListMock.info })
	})

	test('preset activation', () => {
		assert.deepEqual(parseResponse({ cmd: 'matrix preset active mock_matrix_preset_2' }), {
			type: 'presetActivated',
			presetName: 'mock_matrix_preset_2',
		})
	})

	test('preset names may contain underscores', () => {
		const result = parseResponse({ cmd: 'matrix preset active Sunday_Service_1' })
		assert.equal(result.presetName, 'Sunday_Service_1')
	})

	// \\-_ in the regex is a range (backslash to underscore), so a literal dash never matches (PLAN.md bug 8)
	test('preset names containing dashes', { todo: true }, () => {
		const result = parseResponse({ cmd: 'matrix preset active Sunday-Service' })
		assert.equal(result?.presetName, 'Sunday-Service')
	})

	test('aset with one decoder', () => {
		assert.deepEqual(parseResponse({ cmd: 'matrix aset :v TX01-VisMain RX01-LED' }), {
			type: 'aset',
			options: 'v',
			encoder: 'TX01-VisMain',
			decoders: ['RX01-LED'],
		})
	})

	test('aset with several decoders and both video and audio', () => {
		const result = parseResponse({ cmd: 'matrix aset :va TX01-VisMain RX01-LED RX02-Left RX03-Right' })
		assert.equal(result.options, 'va')
		assert.deepEqual(result.decoders, ['RX01-LED', 'RX02-Left', 'RX03-Right'])
	})

	test('ignores responses we do not act on', () => {
		assert.equal(parseResponse({ cmd: 'matrix active mock_mx1' }), undefined)
		assert.equal(parseResponse({ cmd: 'config set device ir POWER RX01' }), undefined)
		assert.equal(parseResponse({ cmd: '' }), undefined)
	})

	test('ignores objects without a string cmd', () => {
		assert.equal(parseResponse({}), undefined)
		assert.equal(parseResponse({ cmd: 5 }), undefined)
		assert.equal(parseResponse(null), undefined)
	})

	// The regex has no space in its character class and the command is not quoted (PLAN.md bug 8)
	test('preset names containing spaces', { todo: true }, () => {
		const result = parseResponse({ cmd: 'matrix preset active Sunday Service' })
		assert.equal(result?.presetName, 'Sunday Service')
	})
})
