const { test, describe, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const MxnetClient = require('../src/mxnet/mxnetClient')

class FakeSocket extends EventEmitter {
	constructor(host, port) {
		super()
		this.host = host
		this.port = port
		this.sent = []
		this.destroyed = false
		this.sendError = undefined
	}

	send(data) {
		if (this.sendError) throw this.sendError
		this.sent.push(data)
	}

	destroy() {
		this.destroyed = true
	}
}

function setup() {
	const ctx = { sockets: [], logs: [], inits: 0, connects: 0, errors: [], responses: [] }
	ctx.client = new MxnetClient({
		host: '10.0.0.5',
		port: 24,
		log: (level, message) => ctx.logs.push({ level, message }),
		createSocket: (host, port) => {
			const socket = new FakeSocket(host, port)
			ctx.sockets.push(socket)
			return socket
		},
		onInit: () => ctx.inits++,
		onConnect: () => ctx.connects++,
		onError: (err) => ctx.errors.push(err),
		onResponse: (data) => ctx.responses.push(data),
	})
	ctx.client.init()
	ctx.socket = () => ctx.sockets[ctx.sockets.length - 1]
	return ctx
}

describe('connection lifecycle', () => {
	test('init creates a socket for the configured host and port', () => {
		const ctx = setup()
		assert.equal(ctx.inits, 1)
		assert.equal(ctx.sockets.length, 1)
		assert.equal(ctx.socket().host, '10.0.0.5')
		assert.equal(ctx.socket().port, 24)
	})

	test('connect and error events are forwarded', () => {
		const ctx = setup()
		ctx.socket().emit('connect')
		assert.equal(ctx.connects, 1)
		const err = new Error('ECONNREFUSED')
		ctx.socket().emit('error', err)
		assert.deepEqual(ctx.errors, [err])
	})

	test('end destroys the old socket and reconnects with a new one', () => {
		const ctx = setup()
		const first = ctx.socket()
		first.emit('end')
		assert.equal(first.destroyed, true)
		assert.equal(ctx.sockets.length, 2)
		assert.equal(ctx.inits, 2)
	})

	test('close destroys the socket', () => {
		const ctx = setup()
		const socket = ctx.socket()
		ctx.client.close()
		assert.equal(socket.destroyed, true)
		assert.equal(ctx.client.socket, undefined)
	})

	test('close is safe to call twice', () => {
		const ctx = setup()
		ctx.client.close()
		assert.doesNotThrow(() => ctx.client.close())
	})
})

describe('sending commands', () => {
	let ctx
	beforeEach(() => {
		ctx = setup()
	})
	const sent = () => ctx.socket().sent

	test('polls', () => {
		ctx.client.pollMatrixPresets()
		ctx.client.pollMatrixes()
		ctx.client.pollDevices()
		assert.deepEqual(sent(), ['matrix preset list\r\n', 'matrix list\r\n', 'config get devicelist\r\n'])
	})

	test('activate preset and matrix', () => {
		ctx.client.activateMatrixPreset('Sunday')
		ctx.client.activateMatrix('main')
		assert.deepEqual(sent(), ['matrix preset active Sunday\r\n', 'matrix active main\r\n'])
	})

	test('IR command joins multiple devices with commas', () => {
		ctx.client.sendIRCommand('RX1', 'POWER')
		ctx.client.sendIRCommand(['RX1', 'RX2'], 'POWER')
		assert.deepEqual(sent(), ['config set device ir POWER RX1\r\n', 'config set device ir POWER RX1,RX2\r\n'])
	})

	test('CEC command joins multiple devices with colons', () => {
		ctx.client.sendCECCommand('RX1', 'on')
		ctx.client.sendCECCommand(['RX1', 'RX2'], 'on')
		assert.deepEqual(sent(), ['config set device cec on RX1\r\n', 'config set device cec on RX1:RX2\r\n'])
	})

	test('video path', () => {
		ctx.client.sendSetVideopath('TX1', 'RX1')
		assert.deepEqual(sent(), ['config set device videopath TX1 RX1\r\n'])
	})

	test('aset flags follow the video and audio options', () => {
		ctx.client.sendMatrixAset('TX1', ['RX1', 'RX2'], true, false)
		ctx.client.sendMatrixAset('TX1', 'RX1', false, true)
		ctx.client.sendMatrixAset('TX1', 'RX1', true, true)
		assert.deepEqual(sent(), [
			'matrix aset :v TX1 RX1 RX2\r\n',
			'matrix aset :a TX1 RX1\r\n',
			'matrix aset :va TX1 RX1\r\n',
		])
	})

	test('heartbeat sends an empty line', () => {
		ctx.client.sendHeartbeatCommand()
		assert.deepEqual(sent(), ['\r\n'])
	})

	test('a failed send is logged and reconnects', () => {
		const first = ctx.socket()
		first.sendError = new Error('socket closed')
		ctx.client.pollDevices()
		assert.ok(ctx.logs.some((l) => l.level === 'error' && /socket closed/.test(l.message)))
		assert.equal(ctx.sockets.length, 2)
		assert.equal(first.destroyed, true)
	})

	// Starting a command with an embedded newline lets one action send several commands (PLAN.md bug 7)
	test('strips line breaks from command arguments', { todo: true }, () => {
		ctx.client.sendIRCommand('RX1', 'POWER\r\nconfig set device ir X RX2')
		assert.equal(sent().length, 1)
		assert.ok(!sent()[0].slice(0, -2).includes('\n'))
	})
})

describe('parsing responses', () => {
	let ctx
	beforeEach(() => {
		ctx = setup()
	})
	const feed = (...chunks) => chunks.forEach((c) => ctx.socket().emit('data', Buffer.from(c)))

	test('a single complete response', () => {
		feed('{"cmd":"matrix list","info":{"a":{}},"code":0}\r\n')
		assert.deepEqual(ctx.responses, [{ cmd: 'matrix list', info: { a: {} }, code: 0 }])
	})

	test('a response split across chunks', () => {
		feed('{"cmd":"matrix li', 'st","info":{"a"', ':{}}}\r\n')
		assert.equal(ctx.responses.length, 1)
		assert.equal(ctx.responses[0].cmd, 'matrix list')
	})

	test('several responses in one chunk', () => {
		feed('{"cmd":"one"}\r\n{"cmd":"two"}\r\n{"cmd":"three"}\r\n')
		assert.deepEqual(
			ctx.responses.map((r) => r.cmd),
			['one', 'two', 'three'],
		)
	})

	test('only top-level values are emitted, not nested ones', () => {
		feed('{"cmd":"x","info":{"nested":{"deep":1}}}')
		assert.equal(ctx.responses.length, 1)
	})

	// Each chunk is decoded on its own, so a character split across two packets is corrupted
	test('multi-byte characters split across chunks are not corrupted', { todo: true }, () => {
		const bytes = Buffer.from('{"cmd":"x","info":{"d":"Café"}}')
		const cut = bytes.indexOf(0xc3) + 1 // between the two bytes of "é"
		ctx.socket().emit('data', bytes.subarray(0, cut))
		ctx.socket().emit('data', bytes.subarray(cut))
		assert.equal(ctx.responses[0]?.info.d, 'Café')
	})

	test('garbage is logged without throwing, and later responses still parse', () => {
		assert.doesNotThrow(() => feed('{{ not json'))
		assert.ok(ctx.logs.some((l) => l.level === 'error' && /parsing response/.test(l.message)))
		feed('{"cmd":"after"}\r\n')
		assert.deepEqual(
			ctx.responses.map((r) => r.cmd),
			['after'],
		)
	})

	test('a truncated response followed by a new one does not wedge the parser', () => {
		feed('{"cmd":"half","info":{"a"')
		feed('{"cmd":"next"}')
		feed('{"cmd":"recovered"}\r\n')
		assert.ok(ctx.responses.some((r) => r.cmd === 'recovered'))
	})
})
