import Signal from './index';
import Trace from '../Trace';

const err = new Error('fail');
const trace = new Trace();

describe('constant', () => {
  describe('ok', () => {
    const s = Signal.ok(7);

    it('is ok', () => {
      expect(s.value.type === 'ok' && s.value.ok).toBe(7);
      expect(s.get()).toBe(7);
    });

    it('maps', () => {
      const s2 = s.map(x => x + 1);
      expect(s2.value.type === 'ok' && s2.value.ok).toBe(8);
    });

    it('flatMaps', () => {
      const s2 = s.flatMap(x => Signal.ok(x + 1));
      expect(s2.value.type === 'ok' && s2.value.ok).toBe(8);
    });
  });

  describe('err', () => {
    const s = Signal.err(err);

    it('is err', () => {
      expect(s.value.type === 'err' && s.value.err).toBe(err);
      expect(() => s.get()).toThrow(err);
    });

    it('maps', () => {
      const s2 = s.map(x => x + 1);
      expect(s2.value.type === 'err' && s2.value.err).toBe(err);
    });

    it('flatMaps', () => {
      const s2 = s.flatMap(x => Signal.ok(x + 1));
      expect(s2.value.type === 'err' && s2.value.err).toBe(err);
    });
  });
});

describe('cell', () => {
  it('is ok', () => {
    const s = Signal.cellOk(7);
    expect(s.value.type === 'ok' && s.value.ok).toBe(7);
    expect(s.get()).toBe(7);
  });

  it('maps', () => {
    const s = Signal.cellOk(7);
    const s2 = s.map(x => x + 1);
    expect(s2.value.type === 'ok' && s2.value.ok).toBe(8);
  });

  it('flatMaps', () => {
    const s = Signal.cellOk(7);
    const s2 = s.flatMap(x => Signal.ok(x + 1));
    expect(s2.value.type === 'ok' && s2.value.ok).toBe(8);
  });

  it('setOk', () => {
    const s = Signal.cellOk(7);
    s.setOk(8);
    s.reconcile(trace, 1);
    expect(s.value.type === 'ok' && s.value.ok).toBe(8);
    expect(s.get()).toBe(8);
  });

  it('setErr', () => {
    const s = Signal.cellOk(7);
    s.setErr(err);
    s.reconcile(trace, 1);
    expect(s.value.type === 'err' && s.value.err).toBe(err);
    expect(() => s.get()).toThrow(err);
  });

  it('unchanged value', () => {
    const s = Signal.cellOk(7);
    expect(s.version).toBe(0);
    s.setOk(7);
    s.reconcile(trace, 1);
    expect(s.version).toBe(0);
    expect(s.value.type === 'ok' && s.value.ok).toBe(7);
    expect(s.get()).toBe(7);
  });
});

describe('map', () => {
  it('propagates changes', () => {
    let calls = 0;
    const c = Signal.cellOk(7);
    const m = c.map(x => { calls++; return x + 1; })

    expect(m.value.type === 'ok' && m.value.ok).toBe(8);
    expect(calls).toBe(1);

    c.setOk(7);
    m.reconcile(trace, 1);
    expect(m.value.type === 'ok' && m.value.ok).toBe(8);
    expect(calls).toBe(1);

    c.setOk(9);
    m.reconcile(trace, 2);
    expect(m.value.type === 'ok' && m.value.ok).toBe(10);
    expect(calls).toBe(2);
  });

  it('does not bump version on equal value', () => {
    let calls = 0;
    const c = Signal.cellOk(7);
    const m = c.map(x => { calls++; return x % 2; })

    expect(m.value.type === 'ok' && m.value.ok).toBe(1);
    expect(calls).toBe(1);
    expect(m.version).toBe(0);

    c.setOk(9);
    m.reconcile(trace, 1);
    expect(m.value.type === 'ok' && m.value.ok).toBe(1);
    expect(calls).toBe(2);
    expect(m.version).toBe(0);
  });
});

describe('flatMap', () => {
  it('propagates changes', () => {
    let calls = 0;
    const c = Signal.cellOk(7);
    const m = c.flatMap(x => { calls++; return Signal.ok(x + 1); })

    expect(m.value.type === 'ok' && m.value.ok).toBe(8);
    expect(calls).toBe(1);

    c.setOk(7);
    m.reconcile(trace, 1);
    expect(m.value.type === 'ok' && m.value.ok).toBe(8);
    expect(calls).toBe(1);

    c.setOk(9);
    m.reconcile(trace, 2);
    expect(m.value.type === 'ok' && m.value.ok).toBe(10);
    expect(calls).toBe(2);
  });

  it('does not bump version on equal value', () => {
    let calls = 0;
    const c = Signal.cellOk(7);
    const m = c.flatMap(x => { calls++; return Signal.ok(x % 2); })

    expect(m.value.type === 'ok' && m.value.ok).toBe(1);
    expect(calls).toBe(1);
    expect(m.version).toBe(0);

    c.setOk(9);
    m.reconcile(trace, 1);
    expect(m.value.type === 'ok' && m.value.ok).toBe(1);
    expect(calls).toBe(2);
    expect(m.version).toBe(0);
  });
});

describe('join', () => {
  it('joins', () => {
    const c1 = Signal.ok(7);
    const c2 = Signal.ok(9);
    const j = Signal.join(c1, c2);

    expect(j.value.type === 'ok' && j.value.ok).toEqual([7, 9]);
  });

  it('propagates errors', () => {
    const c1 = Signal.ok(7);
    const c2 = Signal.ok(9);

    const j = Signal.join(Signal.err(err), c2);
    expect(j.value.type === 'err' && j.value.err).toBe(err);

    const j2 = Signal.join(c1, Signal.err(err));
    expect(j2.value.type === 'err' && j2.value.err).toBe(err);
  });

  it('propagates changes', () => {
    let calls = 0;
    const c1 = Signal.cellOk(7);
    const c2 = Signal.cellOk(9);
    const j = Signal.join(c1, c2).map(([t1, t2]) => { calls++; return [t1, t2] });

    expect(j.value.type === 'ok' && j.value.ok).toEqual([7, 9]);
    expect(calls).toBe(1);

    c1.setOk(7);
    j.reconcile(trace, 1);
    expect(j.value.type === 'ok' && j.value.ok).toEqual([7, 9]);
    expect(calls).toBe(1);

    c2.setOk(9);
    j.reconcile(trace, 2);
    expect(j.value.type === 'ok' && j.value.ok).toEqual([7, 9]);
    expect(calls).toBe(1);

    c1.setOk(11);
    j.reconcile(trace, 3);
    expect(j.value.type === 'ok' && j.value.ok).toEqual([11, 9]);
    expect(calls).toBe(2);
  });
});
