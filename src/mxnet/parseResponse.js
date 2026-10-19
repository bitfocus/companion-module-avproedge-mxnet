// Preset names are everything after the command, so spaces and dashes are allowed
const MATRIX_PRESET_ACTIVE_COMMAND = /^matrix preset active (.+?)\s*$/
const MATRIX_ASET_COMMAND = /^matrix aset :([av]+) (\S+) (.+?)\s*$/

/**
 * Classify a parsed MXnet JSON response by the command it echoes.
 * Returns undefined for responses we don't act on.
 */
function parseResponse(jsonData) {
	const cmd = jsonData?.cmd
	if (typeof cmd !== 'string') return undefined

	if (cmd === 'matrix preset list') {
		return { type: 'presetList', info: jsonData.info }
	}
	if (cmd === 'matrix list') {
		return { type: 'matrixList', info: jsonData.info }
	}
	if (cmd === 'config get devicelist') {
		return { type: 'deviceList', info: jsonData.info }
	}

	const presetMatch = cmd.match(MATRIX_PRESET_ACTIVE_COMMAND)
	if (presetMatch) {
		return { type: 'presetActivated', presetName: presetMatch[1] }
	}

	const asetMatch = cmd.match(MATRIX_ASET_COMMAND)
	if (asetMatch) {
		return {
			type: 'aset',
			options: asetMatch[1],
			encoder: asetMatch[2],
			decoders: asetMatch[3].split(/\s+/),
		}
	}

	return undefined
}

module.exports = parseResponse
