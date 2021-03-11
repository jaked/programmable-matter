import Signal from './Signal.js';

// TODO(jaked) clean this up somewhere
const now = Signal.cellOk(new Date());
setInterval(() => { now.setOk(new Date()) }, 100);

export { now };
