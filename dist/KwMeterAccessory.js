"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SunsynkPlatformAccessory = void 0;
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
class SunsynkPlatformAccessory {
    constructor(platform, accessory) {
        this.platform = platform;
        this.accessory = accessory;
        /**
         * These are just used to create a working example
         * You should implement your own code to track the state of your accessory
         */
        this.states = {
            On: false,
            Brightness: 100,
        };
        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'FUZO')
            .setCharacteristic(this.platform.Characteristic.Model, 'NXASYNK99')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, 'NXASYNK99');
        this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);
        // set the service name, this is what is displayed as the default name on the Home app
        // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);
        if (accessory.context.device.type == "kw") {
            this.accessory.getService(accessory.context.device.displayName + " cW") || this.accessory.addService(this.platform.Service.TemperatureSensor, accessory.context.device.displayName + " cW", accessory.context.device.displayName + " cW");
        }
        if (accessory.context.device.type == "pct") {
            this.accessory.getService(accessory.context.device.displayName + " PCT") || this.accessory.addService(this.platform.Service.TemperatureSensor, accessory.context.device.displayName + " PCT", accessory.context.device.displayName + " PCT");
        }
    }
}
exports.SunsynkPlatformAccessory = SunsynkPlatformAccessory;
//# sourceMappingURL=KwMeterAccessory.js.map