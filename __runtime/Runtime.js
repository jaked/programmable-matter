import Signal from './Signal.js';

// TODO(jaked) clean these up somewhere
const now = Signal.cellOk(new Date());
setInterval(() => { now.setOk(new Date()) }, 100);

const mouse = Signal.cellOk({ clientX: 0, clientY: 0 });
document.addEventListener('mousemove', ({ clientX, clientY }) => {
  mouse.setOk({ clientX, clientY });
});


export { mouse, now };
