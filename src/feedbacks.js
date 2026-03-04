const { combineRgb } = require("@companion-module/base");
const { findDeviceById } = require("./utils");

module.exports = function (self) {
	const devices = self.getDevices() || [];
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

    const feedbacks = {};

    feedbacks.videoSource = {
        type: 'boolean',
        name: 'Decoder has X video source',
        description: 'Show feedback for Video Source',
        options: [
            {
                type: 'dropdown',
                label: 'Decoder',
                id: 'decoder',
                choices: decoderChoices,
				default: decoderChoices[0]?.id || '',
            },
            {
                type: 'dropdown',
                label: 'Video Source',
                id: 'encoder',
                choices: encoderChoices,
				default: encoderChoices[0]?.id || '',
            }
        ],
        defaultStyle: {
            color: combineRgb(0, 0, 0),
            bgcolor: combineRgb(255, 0, 0),
        },
        callback: (event) => {
            let opt = event.options
            const decoderDevice = findDeviceById(self.devices, opt.decoder);
            const encoderDevice = findDeviceById(self.devices, opt.encoder);

            return decoderDevice && encoderDevice 
                && decoderDevice.source_video_channel === encoderDevice.channel;
        },
    };

	self.setFeedbackDefinitions(feedbacks);
}
