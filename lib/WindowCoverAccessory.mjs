export default class WindowCoveringAccessory {
  constructor(log, api, accessory, device) {
    log("WindowCoveringAccessory init");
    const Service = api.hap.Service;
    const Characteristic = api.hap.Characteristic;
    this.log = log;
    this.api = api;
    this.device = device;
    this.service = accessory.getService(Service.WindowCovering);
    this.chars = {};

    device.setUpdateCallbacks(this.updateCurrent.bind(this), this.updateTarget.bind(this));

    accessory.on('identify', (paired, callback) => {
      this.log(accessory.displayName, "Identify!!!");
      callback();
    });

    if (this.service) {
      this.log("Reusing cached service");
    } else {
      this.log("Creating service");
      this.service = accessory.addService(Service.WindowCovering, device.name, device.id);
    } 

    this.addAttr(Characteristic.CurrentPosition, Characteristic.TargetPosition, 'position');
    this.addAttr(Characteristic.CurrentHorizontalTiltAngle, Characteristic.TargetHorizontalTiltAngle, 'angle');
  }

  addAttr(current, target, attr) {
    this.service
      .getCharacteristic(current)
      .on('get', this.getPromise(this.device.getCurrent, attr));

    this.service
      .getCharacteristic(target)
      .on('get', this.getPromise(this.device.getTarget, attr))
      .on('set', this.setPromise(this.device.setTarget, attr));

    this.chars[attr] = {current, target};
  }
  
  getPromise(method, attr) {
    const binded = method.bind(this.device, attr);
    return callback => {
      binded()
      .then(val => callback(null, val))
      .catch(err => {
        this.log.error(err);
        callback(err)
      });      
    }
  }

  setPromise(method, attr) {
    const binded = method.bind(this.device, attr);
    return (value, callback) => {
      binded(value)
      .then(() => callback())
      .catch(err => {
        this.log.error(err);
        callback(err)
      });      
    }
  }

  async getName() {
    return this.device.name;
  }

  updateCurrent(attr, value) {
    this.log(this.device.name, "updateCurrent", attr, value);
    this.service.updateCharacteristic(this.chars[attr].current, value);
  }

  updateTarget(attr, value) {
    this.log(this.device.name, "updateTarget", attr, value);
    this.service.updateCharacteristic(this.chars[attr].target, value);
  }
}
