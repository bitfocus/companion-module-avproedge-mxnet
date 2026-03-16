
function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}
module.exports.arraysEqual = arraysEqual;

function arraysEqualUnordered(a, b) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return arraysEqual(sortedA, sortedB);  // Reuse the function from above
}
module.exports.arrayEqualsUnordered = arraysEqualUnordered;

function deviceIdAndDescriptionEquals(a, b) {
    return arraysEqualUnordered(a.map(aa => aa.id), b.map(bb => bb.id))
        && arraysEqualUnordered(a.map(aa => aa.description), b.map(bb => bb.description));
}
module.exports.deviceIdAndDescriptionEquals = deviceIdAndDescriptionEquals;

function hasAnyDeviceRoutingChanged(a, b) {
    if (a.length !== b.length) return true; // if device count changed, consider routing changed
    for (let i = 0; i < a.length; i++) {
        const deviceA = a[i];
        const deviceB = b.find(d => d.id === deviceA.id);
        if (!deviceB) return true; // device removed, consider routing changed
        if (deviceA.channel !== deviceB.channel
            || deviceA.source_video_channel !== deviceB.source_video_channel
            || deviceA.source_audio_channel !== deviceB.source_audio_channel) {
            return true; // routing changed for this device
        }
    }
}
module.exports.hasAnyDeviceRoutingChanged = hasAnyDeviceRoutingChanged;

function parseDeviceFromRaw(rawDevice) {
    const isEncoder = !!rawDevice.is_host;

    return {
        id: rawDevice.id,
        description: rawDevice.description || rawDevice.id,
        type: isEncoder ? 'encoder' : 'decoder',
        channel: isEncoder ? parseInt(rawDevice.ch) : null,
        source_video_channel: !isEncoder ? parseInt(rawDevice.ch_v) : null,
        source_audio_channel: !isEncoder ? parseInt(rawDevice.ch_a) : null,
    };
}
module.exports.parseDeviceFromRaw = parseDeviceFromRaw;

function parsePresetsFromRaw(rawPresets) {
    const presetNames = Object.keys(rawPresets);
    return presetNames.map(name => {
        const rawPreset = rawPresets[name];
        const presetObj = {
            name,
            routing: {},
        };

        Object.keys(rawPreset).forEach(device => {
            const deviceRouting = rawPreset[device];
            presetObj.routing[device] = {
                source_video_channel: parseInt(deviceRouting.ch_v),
                source_audio_channel: parseInt(deviceRouting.ch_a),
            };
        });

        return presetObj;
    });
}
module.exports.parsePresetsFromRaw = parsePresetsFromRaw;

function findDeviceById(devices, id) {
    return devices.find(device => device.id === id);
}
module.exports.findDeviceById = findDeviceById;