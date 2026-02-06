const telnetlib = require('telnetlib');
const matrixPresetListJson = require('./mocks/matrix_preset_list.json');
const matrixPresetActiveJson = require('./mocks/matrix_preset_active.json');
const matrixListJson = require('./mocks/matrix_list.json');
const matrixActiveJson = require('./mocks/matrix_active.json');
const configGetDevicelistJson = require('./mocks/config_get_devicelist.json');

const RESPONSE_DELAY = 1000;

const MATRIX_PRESET_LIST_COMMAND = /matrix preset list$/;
const MATRIX_PRESET_ACTIVE_COMMAND = /matrix preset active ([a-z0-9\\-_]+)$/;
const MATRIX_LIST_COMMAND = /matrix list$/;
const MATRIX_ACTIVE_COMMAND = /matrix active ([a-z0-9\\-_]+)$/;
const CONFIG_GET_DEVICELIST_COMMAND = /config get devicelist$/;

const writeResponse = (c, response) => {
    setTimeout(() => {
        console.log(response);
        c.write(response + '\r\n');
    }, RESPONSE_DELAY);
}

const writeMatrixPresetListResp = (c) => {
    writeResponse(c, JSON.stringify(matrixPresetListJson));
}

const writeMatrixPresetActiveResp = (c, presetName) => {
    writeResponse(c, JSON.stringify(matrixPresetActiveJson).replaceAll('%%_preset_name_%%', presetName));
}

const writeMatrixListResp = (c) => {
    writeResponse(c, JSON.stringify(matrixListJson));
}

const writeMatrixActiveResp = (c, name) => {
    writeResponse(c, JSON.stringify(matrixActiveJson).replaceAll('%%_name_%%', name));
}

const writeConfigGetDevicelistResp = (c) => {
    writeResponse(c, JSON.stringify(configGetDevicelistJson));
}

const server = telnetlib.createServer({}, (c) => {
    c.on('negotiated', () => {
        console.log('Connected');
    });

    c.on('data', (data) => {
        data = data.toString().trim();
        if (!!data) {
            console.log(`Received: ${data}`);

            if (MATRIX_PRESET_LIST_COMMAND.test(data)) {
                writeMatrixPresetListResp(c);
            } else if (MATRIX_PRESET_ACTIVE_COMMAND.test(data)) {
                const presetName = data.match(MATRIX_PRESET_ACTIVE_COMMAND)[1];
                writeMatrixPresetActiveResp(c, presetName);
            } else if (MATRIX_LIST_COMMAND.test(data)) {
                writeMatrixListResp(c);
            } else if (MATRIX_ACTIVE_COMMAND.test(data)) {
                const name = data.match(MATRIX_ACTIVE_COMMAND)[1];
                writeMatrixActiveResp(c, name);
            } else if (CONFIG_GET_DEVICELIST_COMMAND.test(data)) {
                writeConfigGetDevicelistResp(c);
            } else {
                writeResponse(c, `{"cmd":"${data}"}`);
            }
        }
    });
});

server.listen(9001);