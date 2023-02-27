"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SunsynkHomebridgePlatform = void 0;
const settings_1 = require("./settings");
const KwMeterAccessory_1 = require("./KwMeterAccessory");
const node_fetch_1 = __importDefault(require("node-fetch"));
const loginUrl = "https://pv.inteless.com/oauth/token";
const plantIdEndpoint = "https://pv.inteless.com/api/v1/plants?page=1&limit=10&name=&status=";
async function fetchUserData(username, password) {
    var raw = JSON.stringify({
        username,
        password,
        "grant_type": "password",
        "client_id": "csp-web"
    });
    var requestOptions = {
        method: 'POST',
        headers: {
            'Content-type': 'application/json',
            'Accept': 'application/json'
        },
        body: raw
    };
    const response = await (0, node_fetch_1.default)(loginUrl, requestOptions);
    const { success, data } = await response.json();
    if (success)
        return data;
}
;
async function fetchFlowData(userData, plantId) {
    var requestOptions = {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${userData.access_token}`,
            'Accept': 'application/json',
        }
    };
    const response = await (0, node_fetch_1.default)(`https://pv.inteless.com/api/v1/plant/energy/${plantId}/flow`, requestOptions);
    const { success, data } = await response.json();
    if (success)
        return data;
}
;
/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
class SunsynkHomebridgePlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        // this is used to track restored cached accessories
        this.accessories = [];
        this.log.debug('Finished initializing platform:', this.config.name);
        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            // run the method to discover / register your devices as accessories
            this.discoverDevices(this.config.username, this.config.password, this.config.plantId);
        });
    }
    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        // add the restored accessory to the accessories cache so we can track if it has already been registered
        this.accessories.push(accessory);
    }
    /**
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    async discoverDevices(username, password, plantId) {
        const userData = await fetchUserData(username, password);
        if (userData === null || userData === void 0 ? void 0 : userData.access_token) {
            const Devices = [
                {
                    source: 'flowData',
                    key: 'loadOrEpsPower',
                    light: 'toLoad',
                    scale: 100,
                    displayName: 'House Using',
                    type: 'kw'
                },
                {
                    source: 'flowData',
                    key: 'battPower',
                    light: 'toBat',
                    scale: 100,
                    displayName: 'Battery Charging',
                    type: 'kw'
                },
                {
                    source: 'flowData',
                    key: 'gridOrMeterPower',
                    light: 'gridTo',
                    scale: 100,
                    displayName: 'Grid Supply',
                    type: 'kw'
                },
                {
                    source: 'flowData',
                    key: 'pvPower',
                    light: 'pvTo',
                    scale: 100,
                    displayName: 'Solar Production',
                    type: 'kw'
                },
                {
                    source: 'flowData',
                    key: 'soc',
                    light: 'batTo',
                    scale: 1,
                    displayName: 'Battery Load',
                    type: 'pct'
                }
            ];
            // loop over the discovered devices and register each one if it has not already been registered
            for (const device of Devices) {
                // generate a unique id for the accessory this should be generated from
                // something globally unique, but constant, for example, the device serial
                // number or MAC address
                const uuid = this.api.hap.uuid.generate(`${plantId}_${device.key}_sunsynk`);
                // see if an accessory with the same uuid has already been registered and restored from
                // the cached devices we stored in the `configureAccessory` method above
                const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
                if (existingAccessory) {
                    // the accessory already exists
                    this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
                    // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                    // existingAccessory.context.device = device;
                    // this.api.updatePlatformAccessories([existingAccessory]);
                    // create the accessory handler for the restored accessory
                    // this is imported from `platformAccessory.ts`
                    new KwMeterAccessory_1.SunsynkPlatformAccessory(this, existingAccessory);
                    // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
                    // remove platform accessories when no longer present
                    // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
                    // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
                }
                else {
                    // the accessory does not yet exist, so we need to create it
                    this.log.info('Adding new accessory:', device.displayName);
                    // create a new accessory
                    const accessory = new this.api.platformAccessory(device.displayName, uuid);
                    // store a copy of the device object in the `accessory.context`
                    // the `context` property can be used to store any data about the accessory you may need
                    accessory.context.device = device;
                    // create the accessory handler for the newly create accessory
                    // this is imported from `platformAccessory.ts`
                    new KwMeterAccessory_1.SunsynkPlatformAccessory(this, accessory);
                    // link the accessory to your platform
                    this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
                }
            }
            const loop = async () => {
                const flowData = await fetchFlowData(userData, plantId);
                this.accessories.forEach((accessory) => {
                    accessory.services.forEach((service) => {
                        if (service && accessory.context.device.source == "flowData") {
                            var deviceKeyVal = flowData[accessory.context.device.key];
                            var deviceScale = accessory.context.device.scale;
                            if (typeof deviceKeyVal === 'number' && (deviceScale > 0)) {
                                var cW = deviceKeyVal / deviceScale;
                                var sL = flowData[accessory.context.device.light] ? true : false;
                                //this.log.info(`${accessory.context.device.displayName} => ${sL?"On":"Off"} ${cW}cW ${flowData[accessory.context.device.key]}W`);
                                service.updateCharacteristic(this.Characteristic.CurrentTemperature, cW);
                                service.updateCharacteristic(this.Characteristic.On, sL);
                            }
                        }
                    });
                });
            };
            loop(); //fetch now
            setInterval(loop, 30000); //update every 30s
        }
    }
}
exports.SunsynkHomebridgePlatform = SunsynkHomebridgePlatform;
//# sourceMappingURL=platform.js.map