const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const {
	arraysEqual,
	arrayEqualsUnordered,
	parseDeviceFromRaw,
	parsePresetsFromRaw,
	deviceIdAndDescriptionEquals,
	hasAnyDeviceRoutingChanged,
	findDeviceById,
} = require('../src/utils')
const deviceListMock = require('../mock_control_box/mocks/config_get_devicelist.json')
const presetListMock = require('../mock_control_box/mocks/matrix_preset_list.json')

const decoder = (id, v, a, description = id) => ({
	id,
	description,
	type: 'decoder',
	channel: null,
	source_video_channel: v,
	source_audio_channel: a,
})
const encoder = (id, channel, description = id) => ({
	id,
	description,
	type: 'encoder',
	channel,
	source_video_channel: null,
	source_audio_channel: null,
})

describe('arraysEqual / arrayEqualsUnordered', () => {
	test('ordered comparison', () => {
		assert.equal(arraysEqual([1, 2], [1, 2]), true)
		assert.equal(arraysEqual([1, 2], [2, 1]), false)
		assert.equal(arraysEqual([1], [1, 2]), false)
		assert.equal(arraysEqual([], []), true)
	})

	test('unordered comparison', () => {
		assert.equal(arrayEqualsUnordered(['b', 'a'], ['a', 'b']), true)
		assert.equal(arrayEqualsUnordered(['a'], ['a', 'a']), false)
		assert.equal(arrayEqualsUnordered([], []), true)
	})

	test('unordered comparison does not mutate its inputs', () => {
		const a = ['b', 'a']
		arrayEqualsUnordered(a, ['a', 'b'])
		assert.deepEqual(a, ['b', 'a'])
	})
})

describe('parseDeviceFromRaw', () => {
	test('parses a decoder from the mock device list', () => {
		const device = parseDeviceFromRaw(deviceListMock.info['RX01-LED'])
		assert.deepEqual(device, {
			id: 'RX01-LED',
			description: 'LED Screen',
			type: 'decoder',
			channel: null,
			source_video_channel: 2,
			source_audio_channel: 3,
		})
	})

	test('parses an encoder from the mock device list', () => {
		const device = parseDeviceFromRaw(deviceListMock.info['TX01-VisMain'])
		assert.equal(device.type, 'encoder')
		assert.equal(device.channel, 2)
		assert.equal(device.source_video_channel, null)
		assert.equal(device.source_audio_channel, null)
	})

	test('falls back to the id when there is no description', () => {
		const device = parseDeviceFromRaw({ id: 'RX09', ch_v: '0001', ch_a: '0001' })
		assert.equal(device.description, 'RX09')
	})

	test('parses every device in the mock list', () => {
		const devices = Object.values(deviceListMock.info).map(parseDeviceFromRaw)
		assert.equal(devices.filter((d) => d.type === 'encoder').length, 2)
		assert.equal(devices.filter((d) => d.type === 'decoder').length, 3)
	})
})

describe('parsePresetsFromRaw', () => {
	test('parses the mock preset list', () => {
		const presets = parsePresetsFromRaw(presetListMock.info)
		assert.deepEqual(
			presets.map((p) => p.name),
			['mock_matrix_preset_1', 'mock_matrix_preset_2', 'mock_matrix_preset_3'],
		)
		assert.deepEqual(presets[1].routing['RX01-LED'], { source_video_channel: 3, source_audio_channel: 9999 })
	})

	test('handles an empty preset list', () => {
		assert.deepEqual(parsePresetsFromRaw({}), [])
	})
})

describe('deviceIdAndDescriptionEquals', () => {
	test('equal regardless of order', () => {
		const a = [encoder('TX1', 1), decoder('RX1', 1, 1)]
		const b = [decoder('RX1', 9, 9), encoder('TX1', 1)]
		assert.equal(deviceIdAndDescriptionEquals(a, b), true)
	})

	test('detects an added device, a changed id, and a changed description', () => {
		const base = [encoder('TX1', 1), decoder('RX1', 1, 1)]
		assert.equal(deviceIdAndDescriptionEquals(base, [encoder('TX1', 1)]), false)
		assert.equal(deviceIdAndDescriptionEquals(base, [encoder('TX1', 1), decoder('RX2', 1, 1)]), false)
		assert.equal(deviceIdAndDescriptionEquals(base, [encoder('TX1', 1), decoder('RX1', 1, 1, 'Renamed')]), false)
	})

	test('two empty lists are equal', () => {
		assert.equal(deviceIdAndDescriptionEquals([], []), true)
	})

	test('detects descriptions swapped between devices', () => {
		const a = [decoder('RX1', 1, 1, 'Left'), decoder('RX2', 1, 1, 'Right')]
		const b = [decoder('RX1', 1, 1, 'Right'), decoder('RX2', 1, 1, 'Left')]
		assert.equal(deviceIdAndDescriptionEquals(a, b), false)
	})
})

describe('hasAnyDeviceRoutingChanged', () => {
	const before = [encoder('TX1', 1), decoder('RX1', 1, 1), decoder('RX2', 1, 1)]

	test('false-y when nothing changed, regardless of order', () => {
		const after = [decoder('RX2', 1, 1), encoder('TX1', 1), decoder('RX1', 1, 1)]
		assert.ok(!hasAnyDeviceRoutingChanged(before, after))
	})

	test('detects a changed video or audio source', () => {
		assert.ok(hasAnyDeviceRoutingChanged(before, [encoder('TX1', 1), decoder('RX1', 2, 1), decoder('RX2', 1, 1)]))
		assert.ok(hasAnyDeviceRoutingChanged(before, [encoder('TX1', 1), decoder('RX1', 1, 2), decoder('RX2', 1, 1)]))
	})

	test('detects a changed encoder channel', () => {
		assert.ok(hasAnyDeviceRoutingChanged(before, [encoder('TX1', 5), decoder('RX1', 1, 1), decoder('RX2', 1, 1)]))
	})

	test('detects added and removed devices', () => {
		assert.ok(hasAnyDeviceRoutingChanged(before, before.slice(0, 2)))
		assert.ok(hasAnyDeviceRoutingChanged(before.slice(0, 2), before))
		assert.ok(hasAnyDeviceRoutingChanged(before, [encoder('TX1', 1), decoder('RX1', 1, 1), decoder('RX9', 1, 1)]))
	})

	test('returns a strict false when nothing changed', () => {
		assert.equal(hasAnyDeviceRoutingChanged(before, [...before]), false)
	})
})

describe('findDeviceById', () => {
	const devices = [encoder('TX1', 1), decoder('RX1', 1, 1)]

	test('finds a device or returns undefined', () => {
		assert.equal(findDeviceById(devices, 'RX1'), devices[1])
		assert.equal(findDeviceById(devices, 'nope'), undefined)
	})
})
