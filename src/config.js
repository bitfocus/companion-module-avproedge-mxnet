const { Regex } = require('@companion-module/base')

const ConfigFields = [
	{
		type: 'textinput',
		id: 'host',
		label: 'IP Address',
		tooltip: 'Enter the IP address of the MXnet Control Box and make sure it is reachable from your network.',
		width: 8,
		regex: Regex.IP,
	},
	{
		type: 'number',
		id: 'port',
		label: 'Telnet Port',
		default: 24,
		width: 4,
		tooltip:
			"The default port is 24 - if you don't have any complex network setups, you don't need to change this port. ",
		regex: Regex.PORT,
	},
];  

module.exports = ConfigFields;