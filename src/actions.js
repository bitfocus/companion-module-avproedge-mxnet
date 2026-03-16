module.exports = function (self) {
	const presets = self.getPresetNames() || [];
	const matrixes = self.getMatrixes() || [];
	const devices = self.getDevices() || [];
	const deviceChoices = devices.map((device) => ({
		id: device.id,
		label: device.description
	}));
	const encoderChoices = devices
		.filter((device) => device.type === 'encoder')
		.map((device) => ({
			id: device.id,
			label: device.description
		}));
	const decoderChoices = devices
		.filter((device) => device.type === 'decoder')
		.map((device) => ({
			id: device.id,
			label: device.description
		}));

	const actions = {};

	actions.set_matrix_preset = {
		name: 'Set matrix preset',
		options: [
			{
				id: 'preset',
				type: 'dropdown',
				label: 'Select matrix preset',
				choices: presets.map((preset) => ({
					id: preset,
					label: preset
				})),
				default: presets[0] || ''
			}
		],
		callback: (event) => {
			self.activateMatrixPreset(event.options.preset)
		},
	};

	actions.set_matrix = {
		name: 'Set matrix',
		options: [
			{
				id: 'matrix',
				type: 'dropdown',
				label: 'Select matrix',
				choices: matrixes.map((matrix) => ({
					id: matrix,
					label: matrix
				})),
				default: matrixes[0] || ''
			}
		],
		callback: (event) => {
			self.activateMatrix(event.options.matrix)
		},
	};

	actions.send_matrix_aset = {
		name: 'Connect encoder to decoders (matrix aset)',
		options: [
			{
				id: 'encoder',
				type: 'dropdown',
				label: 'Select encoder',
				width: 12,
				choices: encoderChoices,
				default: encoderChoices[0]?.id || ''
			},
			{
				id: 'decoders',
				type: 'multidropdown',
				label: 'Select decoder',
				width: 12,
				minSelection: 1,
				choices: decoderChoices,
				default: decoderChoices[0]?.id || ''
			},
			{
				id: 'sendVideo',
				type: 'checkbox',
				label: 'Route video?',
				default: true
			},
			{
				id: 'sendAudio',
				type: 'checkbox',
				label: 'Route audio?',
				default: false
			}
		],
		callback: (event) => {
			self.sendMatrixAset(event.options.encoder, event.options.decoders, event.options.sendVideo, event.options.sendAudio)
		},
	};

	actions.send_ir_command = {
		name: 'Send IR command',
		options: [
			{
				id: 'device',
				type: 'multidropdown',
				label: 'Select device',
				width: 12,
				minSelection: 1,
				choices: deviceChoices,
				default: deviceChoices[0]?.id || ''
			},
			{
				id: 'command',
				type: 'textinput',
				label: 'Command',
				width: 12,
				required: true,
			}
		],
		callback: (event) => {
			self.sendIRCommand(event.options.device, event.options.command)
		},
	};

	actions.send_cec_command = {
		name: 'Send CEC command',
		options: [
			{
				id: 'device',
				type: 'multidropdown',
				label: 'Select device',
				width: 12,
				minSelection: 1,
				choices: deviceChoices,
				default: deviceChoices[0]?.id || ''
			},
			{
				id: 'command',
				type: 'textinput',
				label: 'Command',
				width: 12,
				required: true,
			}
		],
		callback: (event) => {
			self.sendCECCommand(event.options.device, event.options.command)
		},
	};

	actions.send_set_videopath = {
		name: 'Set video path',
		options: [
			{
				id: 'encoder',
				type: 'dropdown',
				label: 'Select encoder',
				width: 12,
				choices: encoderChoices,
				default: encoderChoices[0]?.id || ''
			},
			{
				id: 'decoder',
				type: 'dropdown',
				label: 'Select decoder',
				width: 12,
				choices: decoderChoices,
				default: decoderChoices[0]?.id || ''
			}
		],
		callback: (event) => {
			self.sendSetVideopath(event.options.encoder, event.options.decoder)
		},
	};

	self.setActionDefinitions(actions);
}
