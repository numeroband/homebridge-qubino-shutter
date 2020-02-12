import EventEmitter from "events"

const COMMAND_CLASS_SWITCH_MULTILEVEL = 0x26
const COMMAND_CLASS_METER = 0x32
const LEVEL_INDEX = 0
const WATTS_INDEX = 2
const INSTANCE = 1
const LEVEL_LABEL = 'Level'
const WATTS_LABEL = 'Electric - W'
const QUBINO_MANUFACTURER_ID = '0x0159'
const SHUTTER_PRODUCT_ID = '0x0052'
const WATTS_MOVING = 100
const REFRESH_INTERVAL = 100
const INCREMENT = 5 * REFRESH_INTERVAL / 1000

// const sleep = ms => new Promise((resolve, _) => setTimeout(resolve, ms));

class Node {
  static createDualShutter(loc, positionNodeId, angleNodeId) {
    return [
      new Node(positionNodeId, 'position', loc),
      new Node(angleNodeId, 'angle', loc),
    ]
  }

  constructor(nodeId, name, loc) {
    this.nodeId = nodeId;
    this.name = name;
    this.loc = loc;
    this.current = 0;
    this.target = 0;
    this.watts = 0;
    this.trigger = false;
  }

  nodeInfo() {
    return {
      manufacturerid: QUBINO_MANUFACTURER_ID, 
      productid: SHUTTER_PRODUCT_ID, 
      name: this.name, 
      loc: this.loc,
    }
  }

  levelValue() {
    return {
      label: LEVEL_LABEL, 
      instance: INSTANCE,
      index: LEVEL_INDEX,
      value: Math.round(this.current), 
    }
  }

  wattsValue() {
    return {
      label: WATTS_LABEL, 
      instance: INSTANCE,
      index: WATTS_INDEX,
      value: Math.round(this.watts), 
    }
  }
}

export default class OZW extends EventEmitter {
  constructor(config) {    
    super();
    const nodes = Node.createDualShutter('Dormitorio', 3, 2);

    this.nodes = new Map();
    nodes.forEach(node => this.nodes.set(node.nodeId, node));    
  }

  connect(path) {
    setTimeout(this.enumerate.bind(this), 1000);
  }

  enumerate() {
    this.nodes.forEach((node, nodeId) => {
      this.emit('value added', nodeId, COMMAND_CLASS_SWITCH_MULTILEVEL, node.levelValue());
      this.emit('value added', nodeId, COMMAND_CLASS_METER, node.wattsValue());
    });
    this.emit('node ready', 1, {manufacturerid: '0x0000', productid: '0x0000', name: '', loc: ''});
    this.nodes.forEach((node, nodeId) => {
      this.emit('value changed', nodeId, COMMAND_CLASS_SWITCH_MULTILEVEL, node.levelValue());
      this.emit('value changed', nodeId, COMMAND_CLASS_METER, node.wattsValue());
    });
    this.nodes.forEach((node, nodeId) => this.emit('node ready', nodeId, node.nodeInfo()));
    this.emit('scan complete');
    this.interval = setInterval(_ => this.nodes.forEach((node, _) => this.update(node)), REFRESH_INTERVAL);
  }

  setValue(valueInfo, value) {
    if (value > 99 || value < 0) {
      return;
    }

    const node = this.nodes.get(valueInfo.node_id);
    node.target = value;
    node.trigger = true;
  }

  refreshValue(valueInfo) {
    this.nodes.get(valueInfo.node_id).trigger = true;
  }

  update(node) {
    if (node.trigger) {
      node.trigger = false;
      this.emit('value changed', node.nodeId, COMMAND_CLASS_SWITCH_MULTILEVEL, node.levelValue());
      return;
    }

    if (node.current == node.target && node.watts != 0) {
      node.watts = 0;
      this.emit('value changed', node.nodeId, COMMAND_CLASS_METER, node.wattsValue());
      return;
    }

    if (node.current != node.target && node.watts == 0) {
      node.watts = WATTS_MOVING;
      this.emit('value changed', node.nodeId, COMMAND_CLASS_METER, node.wattsValue());
      return;
    }

    if (node.target == node.current) {
      return;
    }

    if (node.target > node.current) {
      node.current += INCREMENT;
      if (node.current >= node.target) {
        node.current = node.target;
        node.trigger = true;
      }
    } else {
      node.current -= INCREMENT;
      if (node.current <= node.target) {
        node.current = node.target;
        node.trigger = true;
      }
    }
  }
}