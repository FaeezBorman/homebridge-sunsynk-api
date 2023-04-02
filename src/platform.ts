import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SunsynkPlatformAccessory } from './KwMeterAccessory';
import fetch from 'node-fetch';
import { writeFile } from 'fs';
import svg2img from 'svg2img';
import { Status, LoadsheddingStage, Search, SearchSuburb, LoadsheddingSchedule, Schedule, Province } from 'eskom-loadshedding-api';
import ModBusRTU from 'modbus-serial';


type UserData = {
  "access_token": string,
  "token_type": string,
  "refresh_token": string,
  "expires_in": number,
  "scope": string
};

const loginUrl = "https://pv.inteless.com/oauth/token";
const plantIdEndpoint = "https://pv.inteless.com/api/v1/plants?page=1&limit=10&name=&status=";


const sunsynkModBusAddr =  {
  overall_state: 59,
  soc:184,
  grid_v:150,
  grid_ct:172,
  grid_inverter:167,
  batt_v:183,
  batt_load:190,
  batt_temp:182,
  load_total:175,
  solar_load:186,
}

async function fetchRSData (){
      
      let res = {};
      const inverter = new ModBusRTU();
      await inverter.connectRTUBuffered("/dev/ttyUSB0", { baudRate: 9600 });

      console.log('inverter', Object.keys(inverter), inverter.getID(), inverter.getTimeout())

      inverter.readHoldingRegisters(172, 1)
        .then((res)=>{
         console.log('Read=172-1 =>', res)
        })
        .catch((err)=>{
      
          console.log('Read Error=172-1 =>', err)
        });

      let addresses = Object.keys(sunsynkModBusAddr);

      for (let index = 0; index < addresses.length; index++) {
        const item = addresses[index];
        console.log('Read',item,'register:',sunsynkModBusAddr[item])
        res[item] = await inverter.readHoldingRegisters(sunsynkModBusAddr[item], 1)
        console.log('Read',res[item])
      };

      inverter.close((status)=>{
        console.log('Disconnected from inverter')
      });

      return res


}
async function fetchUserData<userData> (username,password){
  var raw = JSON.stringify({
    username,
    password,
    "grant_type": "password",
    "client_id": "csp-web"
  });
  
  var requestOptions = {
    method: 'POST',
    headers: {
      'Content-type':'application/json', 
      'Accept':'application/json'
    },
    body: raw
  };
  
  const response = await fetch(loginUrl, requestOptions);
  const { success, data } = await response.json();
  if (success) return data as UserData;
} ;

async function fetchFlowData (userData: UserData, plantId: string){
  var requestOptions = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${userData.access_token}`, 
      'Accept':'application/json',
    }
  };


  const plants = await fetch('https://pv.inteless.com/api/v1/plants?page=1&limit=10&name=&status=&type=-1&sortCol=createAt&order=2', requestOptions);
  const plantsRes = await plants.json();


  const response = await fetch(`https://pv.inteless.com/api/v1/plant/energy/${plantId}/flow`, requestOptions);
  const { success, data } = await response.json();
  if (success) {
    // write image for camera here
    if (plantsRes.success && plantsRes.data.infos[0].updateAt){
      data.updateAt = plantsRes.data.infos[0].updateAt
    }

    writePowerFlowSvg(data)
    return data
  };
} ;

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class SunsynkHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];


  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);
    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices(this.config.username,this.config.password, this.config.plantId);
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices(username,password,plantId) {
    const userData = await fetchUserData(username,password);
    const rsData = await fetchRSData();
    console.log('rsData',rsData)
    //Search.searchSuburbs('Constantia Kloof').then((results: SearchSuburb[]) => console.log('Searching for "Constantia Kloof":', results));
    // const status = await Status.getStatus();
    // console.log('Current status: ', status)
    
    // const schedule = await Schedule.getSchedule(1020831, status)
    //console.log('Current sched: ', schedule)
    if (userData?.access_token){

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
         
           new SunsynkPlatformAccessory(this, existingAccessory);
  
          // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
          // remove platform accessories when no longer present
          // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
        } else {
          // the accessory does not yet exist, so we need to create it
          this.log.info('Adding new accessory:', device.displayName);
  
          // create a new accessory
          
          const accessory = new this.api.platformAccessory(device.displayName, uuid);
  
          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = device;
  
          // create the accessory handler for the newly create accessory
          // this is imported from `platformAccessory.ts`
          new SunsynkPlatformAccessory(this, accessory);
  
          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
      // const inverter = new ModBusRTU();
      // inverter.connectRTUBuffered("/dev/ttyUSB0", { baudRate: 9600 });
      // inverter.setID(1);
      // inverter.on('close',()=>{
      //   // reconnect
      //   console.log('inverter connection closed')
      //   //inverter.connectRTUBuffered("/dev/ttyUSB0", { baudRate: 9600 });
      // });

      const loop = async ()=>{
        const flowData = await fetchFlowData(userData, plantId)
        // const rsData = await fetchRSData()
        let res = {}
        // let addresses = Object.keys(sunsynkModBusAddr);

        // for (let index = 0; index < addresses.length; index++) {
        //   const item = addresses[index];
        //   console.log('Read',item,'Register:',sunsynkModBusAddr[item])
        //   res[item] = await inverter.readHoldingRegisters(sunsynkModBusAddr[item], 1)
        //   console.log('Read',res[item])
        // };

        this.accessories.forEach((accessory)=>{
          accessory.services.forEach((service)=>{
            if ( service && accessory.context.device.source == "flowData" ){
              var deviceKeyVal = flowData[accessory.context.device.key] 
              var deviceScale = accessory.context.device.scale; 

              if (typeof deviceKeyVal === 'number' && (deviceScale>0)){
                var cW = deviceKeyVal/deviceScale;
                var sL = flowData[accessory.context.device.light]?true:false;
                //this.log.info(`${accessory.context.device.displayName} => ${sL?"On":"Off"} ${cW}cW ${flowData[accessory.context.device.key]}W`);
                service.updateCharacteristic(this.Characteristic.CurrentTemperature, cW);
                service.updateCharacteristic(this.Characteristic.On, sL);
              }
            }

          })
        })
      }
      loop(); //fetch now
      setInterval(()=>{loop()},25000); //update every 30s
    }
//export PATH="/opt/homebridge/bin:$PATH"
  }
}

function calcNextUpdate(updatedAt) {

  var date = new Date(updatedAt)
  var nextUpdate = new Date (date.getTime() + 5*60000)
  var now = new Date();
  var ttu = Math.round((nextUpdate.getTime() - now.getTime())/1000)
  var tts = Math.round((now.getTime() - date.getTime())/1000)
  return {
    date,
    nextUpdate,
    ttu,
    tts
  }
}

function getMessageLine(text,line){
  return `
  <g transform="matrix(0.75 0 0 0.6 800.41 ${450+(line*30)}.29)" style=""  >
      <text xml:space="preserve" font-family="'Open Sans', sans-serif" font-size="47" font-style="normal" font-weight="normal" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(161,255,0); fill-rule: nonzero; opacity: 1; white-space: pre;" ><tspan x="-220.37" y="14.76" >${text}</tspan></text>
  </g>
  `
}

async function writePowerFlowSvg(data){



  const tweet = '4m #Loadshedding Loadshedding will continue to be suspended until 05:00 on Monday. Thereafter, Stage 1 loadshedding will be implemented from 05:00 until 16:00 on Monday. ^MM';
  const importantMessage = data.gridTo?'':'!!!Grid Off!!!';
  const dates = calcNextUpdate(data.updateAt);
  const informationMessageB = dates.date.toString();
  var messages = getMessageLine(importantMessage,1);
  if(dates.tts>60){
    messages += getMessageLine(`${Math.round(dates.tts/60)}m`,2);
  }else{
    if(dates.tts>240){

      messages += getMessageLine(`-${dates.ttu}s`,2);
    }else{

      messages += getMessageLine(`${dates.tts}s`,2);
    }
  }
  

  let status = await Status.getStatus();
  if (status>0){

    const sub = await Search.searchSuburbs('Constantia Kloof',1)
    const { schedule } = await Schedule.getSchedule(sub[0].id,status);
    //console.log('ls',schedule)
    for (let i = 0; i < schedule.length; i++) {
      const slot = schedule[i];
      if(schedule[i+1]){
          messages += getMessageLine(schedule[i]+'  '+schedule[i],i+2);
          i++;
        }else{
          messages += getMessageLine(schedule[i],i+2);
      }
    }
  }

  
  const svg=  `
  <?xml version="1.0" encoding="UTF-8" standalone="no" ?>
  <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="1200" height="900" viewBox="0 0 1200 900" xml:space="preserve">
  <desc>Created with Fabric.js 5.2.4</desc>
  <defs>
  </defs>
  <rect x="0" y="0" width="100%" height="100%" fill="transparent"></rect>
  <g transform="matrix(1 0 0 1 600 450)" id="b88ae65a-0c90-44c7-83b2-4a40325c1e03"  >
  <rect style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(49,4,4); fill-rule: nonzero; opacity: 1;" vector-effect="non-scaling-stroke"  x="-600" y="-450" rx="0" ry="0" width="1200" height="900" />
  </g>
  <g transform="matrix(Infinity NaN NaN Infinity 0 0)" id="c4b2a23e-25a0-438e-9453-618e583eca87"  >
  </g>
  <g transform="matrix(2.67 0 0 2.67 740.02 394.35)"  >
    <image style="stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(0,0,0); fill-rule: nonzero; opacity: 1;" vector-effect="non-scaling-stroke"  xlink:href="data:image/png;base64,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" x="-32" y="-32" width="64" height="64"></image>
  </g>
  <g transform="matrix(2.86 0 0 2.86 256.13 243.49)"  >
    <image style="stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(0,0,0); fill-rule: nonzero; opacity: 1;" vector-effect="non-scaling-stroke"  xlink:href="data:image/png;base64,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" x="-32" y="-32" width="64" height="64"></image>
  </g>
  <g transform="matrix(2.83 0 0 2.83 519.59 663.63)"  >
    <image style="stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(0,0,0); fill-rule: nonzero; opacity: 1;" vector-effect="non-scaling-stroke"  xlink:href="data:image/png;base64,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" x="-32" y="-32" width="64" height="64"></image>
  </g>
  <g transform="matrix(2.39 0 0 2.39 264.37 558.16)"  >
    <image style="stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(0,0,0); fill-rule: nonzero; opacity: 1;" vector-effect="non-scaling-stroke"  xlink:href="data:image/png;base64,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" x="-32" y="-32" width="64" height="64"></image>
  </g>
  <g transform="matrix(2.23 0 0 2.23 508.6 411.34)"  >
    <image style="stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(0,0,0); fill-rule: nonzero; opacity: 1;" vector-effect="non-scaling-stroke"  xlink:href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAABBhJREFUeF7tm19sS1Ecx7+3fzbdqmXtrJv90QWb1VK1BJEw/4LEMw8SHhHBq0UmXmRIPCFiT8SDSCQiESTMn2D+xczCZv5tturaaDvpunbd1t4r5yZmZdretrd67Jy3m/Pvdz739zv3/H73dzhM88JN8/WDAWAaMM0JxDWBvZ33tZFRvhGCsB0cV5b1vATBDo67pMxVHD1rWTscT96YAMTFj/EPa3QG2wZTBQpn5IHL4m1DgAB3KIgWVx+6hrztyhzF6ngQYgLY/eru8Rq94eBOswUcF1dZ4sHOWL0gCLjY24kun/dE89L1DbEmjg2graX/QHVd2dy8mRkTPl0TOYJ+nOpuszfXbShPHsCru0LTklVQcop0yZWxccb4CA53PEbz0vUxX3I8ExBO2OozJnQ6JxrneTR2PGIAmAYwE5BhD3CNBPBy0AXyuZFadOpcrJ5TKvtnVdY94Jr9I556BqSufaJ9g2U5ZufMSLp/Ih1lBXDV/gHPPc5E5JiyDfUAXniduOnogXQDAGaq1NhfVYdcpTJpgIl0lFUDEhHgX7dhANhBiJ0E2VGY+QLMGWLeIHOHmTtMkzv8LRTEM88Aeod9CEbGkadUo1I7CysLS2DI1Ug6XFJ1EgzzPG4N9KDV7ZjSv1ByHDYWz0P9nLIoN5q45bedX7DCWIyFuoIoQNQAGImEcf7zG/QFhuK+4UU6A7ZVVCFPpcbXgB8Xet7CHx4T+60rKsemEvPEGNQAuNjTiU6fJ2rxJRotTJp8DASH4QoFouo0ShVIPTETfpK+LNYbsaPSQh+AFucX3HH1iYKTxW2rqEaN3iA+k4jTc68T179+QjhG9KlYk49d862iZvws1GgAEfj90CCeuB3YXGJGsUb7hynYA35c7nsHz+jIH3UEFoFG4E0uVAGIa/wAyIJIHLLb50UgPC5+FWwFRajSFUz5t/K/A5AIpP9aAxgAiQSYCbCQGAuJpSckVjvLKNH6sqM5L0A8YabsDm+duyA7VpSEFFccH1MHcM62Lomps6PLnvZ7DEDKJsA0IAMmMDgWwmufG0mkG4i2RhKdavVGFP4WNaLGBI50PUOpRhvlzkrZRUYjEXwY/o5jlpVRESNqABBBT1nrkaNI/pc5GeO0dQ3Uil8pfVQB+F14KRpA2jIATAMoNoGGt61YXmCCTpUjVfPF9iSyfM9tx8naVVBMSupOyx5wZskaqGTOFe4P+vF00Bkz8BmLDPlvsGx2ESrz9RPNwgKPfa8fpHgSbGvpP1S9rKycwmxxArWp+0XK2eLHrXrjwT3mWtkTG5PS/b90IuH0c71v0OHzpHZf4OeNEavOaNtiMsNEwY0RVyiIG65edAx5Ur8xQgBP6ztD6VTLbB2LnotAMhFkAGQCS82wTAOoeVUyCfoDJ5jZXw8LlZEAAAAASUVORK5CYII=" x="-32" y="-32" width="64" height="64"></image>
  </g>
  <g transform="matrix(0.94 0 0 0.94 463.53 369.26)" style=""  >
      <text xml:space="preserve" font-family="'Open Sans', sans-serif" font-size="50" font-style="normal" font-weight="bold" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(241,157,49); fill-rule: nonzero; opacity: 1; white-space: pre;" ><tspan x="-329.26" y="15.71" >${data.gridOrMeterPower}w</tspan></text>
  </g>
  <g transform="matrix(0.94 0 0 0.94 353.23 450)" style=""  >
      <text xml:space="preserve" font-family="'Open Sans', sans-serif" font-size="50" font-style="normal" font-weight="bold" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(49,184,241); fill-rule: nonzero; opacity: 1; white-space: pre;" ><tspan x="-215.36" y="15.71" >${data.pvPower}w</tspan></text>
  </g>
  <g transform="matrix(1.07 0 0 1.07 954.89 689.95)" style=""  >
      <text xml:space="preserve" font-family="'Open Sans', sans-serif" font-size="50" font-style="normal" font-weight="bold" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(251,84,89); fill-rule: nonzero; opacity: 1; white-space: pre;" ><tspan x="-312.6" y="15.71" >${data.loadOrEpsPower}w</tspan></text>
  </g>
  <g transform="matrix(0.75 0 0 0.75 1021.57 431.56)" style=""  >
      <text xml:space="preserve" font-family="'Open Sans', sans-serif" font-size="50" font-style="normal" font-weight="bold" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(49,241,76); fill-rule: nonzero; opacity: 1; white-space: pre;" ><tspan x="-232.01" y="15.71" >${data.battPower}w</tspan></text>
  </g>
  <g transform="matrix(1.24 0 0 1.24 1035.03 361.18)" style=""  >
      <text xml:space="preserve" font-family="'Open Sans', sans-serif" font-size="50" font-style="normal" font-weight="bold" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(49,241,76); fill-rule: nonzero; opacity: 1; white-space: pre;" ><tspan x="-157.02" y="15.71" >${data.soc}%</tspan></text>
  </g>
  <g transform="matrix(1.48 0 0 1.48 561.41 257.94)" style=""  >
      <text xml:space="preserve" font-family="'Open Sans', sans-serif" font-size="47" font-style="normal" font-weight="normal" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(225,22,22); fill-rule: nonzero; opacity: 1; white-space: pre;" ><tspan x="-222.08" y="14.76" >${status==LoadsheddingStage.UNKNOWN?'':status}</tspan></text>
  </g>
  <g transform="matrix(0.49 0 0 0.7 181.22 39.16)" style=""  >
      <text xml:space="preserve" font-family="'Open Sans', sans-serif" font-size="47" font-style="normal" font-weight="normal" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(0,189,255); fill-rule: nonzero; opacity: 1; white-space: pre;" ><tspan x="-256.04" y="14.76" >${informationMessageB}</tspan></text>
  </g>
  <g transform="matrix(0.47 0 0 0.38 94.22 71.41)" style=""  >
      <text xml:space="preserve" font-family="'Open Sans', sans-serif" font-size="47" font-style="normal" font-weight="normal" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(161,255,0); fill-rule: nonzero; opacity: 1; white-space: pre;" ><tspan x="-84.94" y="14.76" >${tweet}</tspan></text>
  </g>
  <g transform="matrix(2.23 0 0 2.23 478.6 391.34)" width="100" height="100" >
    <rect id="rect"
 
      rx="30"
      ry="30"
      height="30"
      width="30"
      stroke-width="5"
      stroke-dasharray="${Math.round(100*(dates.tts/300))}, 100"
      style="stroke: blue; fill: none;"
    /> 
  </g>
  ${ messages }
  </svg>
  `;

  writeFile('sunsynk-info.svg',svg,()=>{
    //console.log('wrote animation file ',process.cwd()+'/sunsynk-info.svg')
    svg2img(svg,(err,buffer)=>{
      console.log('error converting to png', err)
      writeFile('sunsynk-info.png',buffer,()=>{})
    })
  })
}