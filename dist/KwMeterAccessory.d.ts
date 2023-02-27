import { PlatformAccessory } from 'homebridge';
import { SunsynkHomebridgePlatform } from './platform';
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export declare class SunsynkPlatformAccessory {
    private readonly platform;
    private readonly accessory;
    private service;
    /**
     * These are just used to create a working example
     * You should implement your own code to track the state of your accessory
     */
    private states;
    constructor(platform: SunsynkHomebridgePlatform, accessory: PlatformAccessory);
}
//# sourceMappingURL=KwMeterAccessory.d.ts.map