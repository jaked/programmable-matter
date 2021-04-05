import Signal from './Signal.js';

// TODO(jaked) clean these up somewhere
const now = Signal.cellOk(Date.now());
setInterval(() => { now.setOk(Date.now()) }, 100);

const mouse = Signal.cellOk({ clientX: 0, clientY: 0 });
document.addEventListener('mousemove', ({ clientX, clientY }) => {
  mouse.setOk({ clientX, clientY });
});

const windowSignal = Signal.cellOk({ innerWidth: 0, innerHeight: 0, scrollX: 0, scrollY: 0 });
const onScrollOrResize = (e) => {
  windowSignal.setOk({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  });
}
window.addEventListener('resize', onScrollOrResize);
document.addEventListener('scroll', onScrollOrResize);
onScrollOrResize();

export { mouse, now, windowSignal as window };
