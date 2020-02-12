import QubinoShutter from './QubinoShutter.mjs'
import OZW from 'openzwave-shared'
// import OZW from './MockupOZW.mjs'

const COMMAND_CLASS_SWITCH_MULTILEVEL = 0x26
const COMMAND_CLASS_METER = 0x32
const LEVEL_INDEX = 0
const WATTS_INDEX = 2
const INSTANCE = 1
const QUBINO_MANUFACTURER_ID = '0x0159'
const SHUTTER_PRODUCT_ID = '0x0052'
const REFRESH_INTERVAL = 5000

function getOrAdd(map, key, value) {
  let ret = map.get(key);
  if (!ret) {
    ret = value;
    map.set(key, value);
  }
  return ret;
}

export default class QubinoShutterManager {
  constructor(log, path) {
    this.log = log;
    this.path = path;
    this.devices = new Map();
    this.nodes = new Map();
    this.devicesInfo = new Map();
  }

  async getDevices() {
    await this.connect();
    this.devicesInfo.forEach((nodes, name) => {
      const device = new QubinoShutter(this, name, nodes);
      this.devices.set(name, device);
      nodes.forEach(nodeInfo => nodeInfo.device = device);
    });
    this.devicesInfo = undefined;
    return [...this.devices.values()];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.zwave = new OZW({
        Logging: false,
        ConsoleOutput: false,
      });
      this.zwave.on('value added', this.valueAdded.bind(this));
      this.zwave.on('value changed', this.valueChanged.bind(this));
      this.zwave.on('node ready', this.nodeReady.bind(this));
      this.zwave.on('scan complete', () => resolve());
      this.zwave.on('driver failed', () => reject(new Error('Driver failed')));
      this.log('Connecting to', this.path);
      this.zwave.connect(this.path);  
    });
  }

  valueAdded(nodeId, classId, value) {
    this.log.debug('valueAdded', nodeId, classId, value.label, '=', value.value);
    if (classId == COMMAND_CLASS_SWITCH_MULTILEVEL && value.index == LEVEL_INDEX) {
      getOrAdd(this.nodes, nodeId, {}).level = value.value;
    }
    if (classId == COMMAND_CLASS_METER && value.index == WATTS_INDEX) {
      getOrAdd(this.nodes, nodeId, {}).moving = (value.value > 0);
    }
  }

  valueChanged(nodeId, classId, value) {
    this.log.debug('valueChanged', nodeId, classId, value.label, '=', value.value);
    if (classId == COMMAND_CLASS_SWITCH_MULTILEVEL && value.index == LEVEL_INDEX) {
      const nodeInfo = this.nodes.get(nodeId);
      nodeInfo.level = value.value;
      if (nodeInfo.device) {
        nodeInfo.device.update(nodeInfo.attr, nodeInfo.level, nodeInfo.moving);
      }
    }
    if (classId == COMMAND_CLASS_METER && value.index == WATTS_INDEX) {
      const nodeInfo = this.nodes.get(nodeId);
      nodeInfo.moving = (value.value > 0);
      if (nodeInfo.moving && !nodeInfo.refresh) {
        nodeInfo.refresh = setInterval(() => this.refreshLevel(nodeId), REFRESH_INTERVAL);
        this.refreshLevel(nodeId);
      }
      if (!nodeInfo.moving && nodeInfo.refresh) {
        clearTimeout(nodeInfo.refresh);
        nodeInfo.refresh = undefined;
        this.refreshLevel(nodeId);
      }
    }
  }

  refreshLevel(nodeId) {
    this.zwave.refreshValue({
      node_id: nodeId,
      class_id: COMMAND_CLASS_SWITCH_MULTILEVEL,
      instance: INSTANCE,
      index: LEVEL_INDEX
    });
  }

  nodeReady(nodeId, nodeInfo) {
    this.log.debug('node', nodeId, 'ready')
    if (nodeInfo.manufacturerid != QUBINO_MANUFACTURER_ID || nodeInfo.productid != SHUTTER_PRODUCT_ID) {
      return;
    }
    const info = getOrAdd(this.nodes, nodeId, {});
    info.nodeId = nodeId;
    info.attr = nodeInfo.name;
    info.name = nodeInfo.loc;
    getOrAdd(this.devicesInfo, info.name, []).push(info);
  }

  setLevel(nodeId, level) {
    this.log.debug('setLevel', nodeId, level);
    this.zwave.setValue({
      node_id: nodeId,
      class_id: COMMAND_CLASS_SWITCH_MULTILEVEL,
      instance: INSTANCE,
      index: LEVEL_INDEX
    }, level);
  }
}
