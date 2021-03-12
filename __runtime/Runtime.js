import Signal from './Signal.js';

// TODO(jaked) clean these up somewhere
const now = Signal.cellOk(Date.now());
setInterval(() => { now.setOk(Date.now()) }, 100);

const mouse = Signal.cellOk({ clientX: 0, clientY: 0 });
document.addEventListener('mousemove', ({ clientX, clientY }) => {
  mouse.setOk({ clientX, clientY });
});


export { mouse, now };
