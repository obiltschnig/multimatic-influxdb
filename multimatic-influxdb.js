var net = require('net');
var influxdb = require('bndl://io.macchina.js.influxdb.write/influxdb.js')

const influxURL    = application.config.getString('influxdb.url', 'http://influxdb:8086/api/v2/write');
const influxOrg    = application.config.getString('influxdb.org');
const influxBucket = application.config.getString('influxdb.bucket');
const influxToken  = application.config.getString('influxdb.token');

var VaillantAPI =
{
    cookieJar: new net.CookieJar(),
    vaillantMobileApp: application.config.getString('vaillant.mobileApp', 'multiMATIC v2.1.45 b389 (Android)'),
    userAgent: application.config.getString('vaillant.userAgent', 'Chinzilla/1.0'),

    getToken: function(username, password) {
        return new Promise((resolve, reject) => {
            console.log('Getting new token...');
            var tokenRequest = net.HTTPRequest.post('https://smart.vaillant.com/mobile/api/v4/account/authentication/v1/token/new');
            tokenRequest.set('User-Agent', this.userAgent);
            tokenRequest.set('Vaillant-Mobile-App', this.vaillantMobileApp);
            tokenRequest.contentType = 'application/json';
            tokenRequest.content = JSON.stringify(
                {
                    smartphoneId: system.nodeId,
                    username: username,
                    password: password
                });
            tokenRequest.send(result => {
                if (result.error)
                {
                    reject(result.error);
                }
                else if (result.response.status === 200)
                {
                    var json = JSON.parse(result.response.content);
                    resolve(json.body.authToken);
                }
                else
                {
                    reject(result.response.reason);
                }
            });
        });
    },

    authenticate: function(username, authToken) {
        return new Promise((resolve, reject) => {
            console.log('Authenticating with token...');
            var request = net.HTTPRequest.post('https://smart.vaillant.com/mobile/api/v4/account/authentication/v1/authenticate');
            request.set('User-Agent', this.userAgent);
            request.set('Vaillant-Mobile-App', this.vaillantMobileApp);
            request.contentType = 'application/json';
            request.content = JSON.stringify(
                {
                    smartphoneId: system.nodeId,
                    username: username,
                    authToken: authToken
                });
            request.send(result => {
                if (result.error)
                {
                    reject(result.error);
                }
                else if (result.response.status === 200)
                {
                    this.cookieJar.updateCookies(result.response);
                    resolve();
                }
                else
                {
                    reject(result.response.reason);
                }
            });
        });
    },

    getJSON: function(uri) {
        return new Promise((resolve, reject) => {
            var request = net.HTTPRequest.get(uri);
            request.set('User-Agent', this.userAgent);
            request.set('Vaillant-Mobile-App', this.vaillantMobileApp);
            this.cookieJar.addCookies(request);
            request.send(result => {
                if (result.error)
                {
                    reject(result.error);
                }
                else if (result.response.status === 200)
                {
                    this.cookieJar.updateCookies(result.response);
                    var json = JSON.parse(result.response.content);
                    resolve(json);
                }
                else
                {
                    reject(result.response.reason);
                }
            });
        });
    },

    getFacilities: function() {
        return this.getJSON('https://smart.vaillant.com/mobile/api/v4/facilities');
    },

    getLiveReport: function(facility) {
        return this.getJSON('https://smart.vaillant.com/mobile/api/v4/facilities/' + facility + '/livereport/v1/');
    },

    getSystemControlStatus: function(facility) {
        return this.getJSON('https://smart.vaillant.com/mobile/api/v4/facilities/' + facility + '/systemcontrol/v1/status');
    },

    getSystemControlZones: function(facility) {
        return this.getJSON('https://smart.vaillant.com/mobile/api/v4/facilities/' + facility + '/systemcontrol/v1/zones');
    },

    getEMF: function(facility) {
        return this.getJSON('https://smart.vaillant.com/mobile/api/v4/facilities/' + facility + '/emf/v1/devices');
    },

    getEMFMeterReading: function(emf, func, energyType) {
        for (const report of emf.body[0].reports)
        {
            if (report.function === func && report.energyType === energyType)
            {
                return report.currentMeterReading;
            }
        }
        return null;
    },

    getLiveReportDevice: function(liveReport, deviceId) {
        for (const device of liveReport.body.devices)
        {
            if (device._id === deviceId)
            {
                return device;
            }
        }
        return null;
    },

    getLiveReportMeasurement: function(liveReport, deviceId, measurementId) {
        var device = this.getLiveReportDevice(liveReport, deviceId);
        for (const report of device.reports)
        {
            if (report._id === measurementId)
            {
                return report.value;
            }
        }
        return null;
    },

    getSetpointTemperature: function(zones) {
        return zones.body[0].heating.configuration.setpoint_temperature;
    }
};

async function storeMeasurements(serialNumber)
{
    const emf = await VaillantAPI.getEMF(serialNumber);
    const chEnvironmentalYield = VaillantAPI.getEMFMeterReading(emf, 'CENTRAL_HEATING', 'ENVIRONMENTAL_YIELD');
    const chConsumedElectricalPower = VaillantAPI.getEMFMeterReading(emf, 'CENTRAL_HEATING', 'CONSUMED_ELECTRICAL_POWER');
    const dhwEnvironmentalYield = VaillantAPI.getEMFMeterReading(emf, 'DHW', 'ENVIRONMENTAL_YIELD');
    const dhwConsumedElectricalPower = VaillantAPI.getEMFMeterReading(emf, 'DHW', 'CONSUMED_ELECTRICAL_POWER');
    console.log('chEnvironmentalYield = %f', chEnvironmentalYield);
    console.log('chConsumedElectricalPower = %f', chConsumedElectricalPower);
    console.log('dhwEnvironmentalYield = %f', dhwEnvironmentalYield);
    console.log('dhwConsumedElectricalPower = %f', dhwConsumedElectricalPower);

    const status = await VaillantAPI.getSystemControlStatus(serialNumber);
    const outsideTemperature = status.body.outside_temperature;
    console.log('outsideTemperature = %f', outsideTemperature);

    const liveReport = await VaillantAPI.getLiveReport(serialNumber);
    const flowTemperature = VaillantAPI.getLiveReportMeasurement(liveReport, 'Control_CC1', 'FlowTemperatureSensor');
    const dhwTemperature = VaillantAPI.getLiveReportMeasurement(liveReport, 'Control_DHW', 'DomesticHotWaterTankTemperature');
    const waterPressure = VaillantAPI.getLiveReportMeasurement(liveReport, 'Control_SYS_MultiMatic', 'WaterPressureSensor');

    console.log('flowTemperature = %f', flowTemperature);
    console.log('dhwTemperature = %f', dhwTemperature);
    console.log('waterPressure = %f', waterPressure);

    const zones = await VaillantAPI.getSystemControlZones(serialNumber);
    const setpointTemperature = VaillantAPI.getSetpointTemperature(zones);

    console.log('setpointTemperature = %f', setpointTemperature);

    const measurements = [
        {
            name: 'heatpump',
            tags: {
                serialNumber: serialNumber
            },
            fields: {
                outsideTemperature: outsideTemperature,
                setpointTemperature: setpointTemperature,
                flowTemperature: flowTemperature,
                tankTemperature: dhwTemperature,
                waterPressure: waterPressure,
                heatingEnvironmentalYield: chEnvironmentalYield,
                heatingPowerConsumption: chConsumedElectricalPower,
                hotWaterEnvironmentalYield: dhwEnvironmentalYield,
                hotWaterPowerConsumption: dhwConsumedElectricalPower
            },
            ts: DateTime().timestamp
        }
    ];
    await influxdb.postMeasurements(influxURL, influxOrg, influxBucket, influxToken, measurements);
}

async function retryStoreMeasurements(username, password, serialNumber)
{
    try
    {
        await storeMeasurements(serialNumber);
    }
    catch (err)
    {
        console.error('Error: %s', err);
        console.log('Attempting new login...');
        try
        {
            const authToken = await VaillantAPI.getToken(username, password);
            await VaillantAPI.authenticate(username, authToken);
            await storeMeasurements(serialNumber);
        }
        catch (err)
        {
            console.error('Error: %s', err);
            console.log('Re-login failed. Will retry later.');
        }
    }
}

async function main()
{
    try
    {
        const username = application.config.getString('vaillant.username');
        const password = application.config.getString('vaillant.password');
        const authToken = await VaillantAPI.getToken(username, password);
        await VaillantAPI.authenticate(username, authToken);
        const facilities = await VaillantAPI.getFacilities();
        const serialNumber = facilities.body.facilitiesList[0].serialNumber;
        console.log('Serial Number: %s', serialNumber);

        await storeMeasurements(serialNumber);

        setInterval(
            () => {
                retryStoreMeasurements(username, password, serialNumber);
            },
            1000*application.config.getInt('vaillant.sampleInterval', 10*60)
        );
    }
    catch (err)
    {
        console.error(err);
    }
};

main();
