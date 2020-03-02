import * as Immutable from 'immutable';
import Signal from './index';
import Trace from '../Trace';

const err = new Error('fail');
const trace = new Trace();

describe('constant', () => {
  describe('ok', () => {
    const s = Signal.ok(7);

    it('is ok', () => {
      expect(s.get()).toBe(7);
    });

    it('maps', () => {
      const s2 = s.map(x => x + 1);
      s2.reconcile(trace, 1);
      expect(s2.get()).toBe(8);
    });

    it('flatMaps', () => {
      const s2 = s.flatMap(x => Signal.ok(x + 1));
      s2.reconcile(trace, 1);
      expect(s2.get()).toBe(8);
    });
  });

  describe('err', () => {
    const s = Signal.err(err);

    it('is err', () => {
      expect(() => s.get()).toThrow(err);
    });

    it('maps', () => {
      const s2 = s.map(x => x + 1);
      s2.reconcile(trace, 1);
      expect(() => s2.get()).toThrow(err);
    });

    it('flatMaps', () => {
      const s2 = s.flatMap(x => Signal.ok(x + 1));
      s2.reconcile(trace, 1);
      expect(() => s2.get()).toThrow(err);
    });
  });
});

describe('cell', () => {
  it('is ok', () => {
    const s = Signal.cellOk(7);
    expect(s.get()).toBe(7);
  });

  it('maps', () => {
    const s = Signal.cellOk(7);
    const s2 = s.map(x => x + 1);
    s2.reconcile(trace, 1);
    expect(s2.get()).toBe(8);
  });

  it('flatMaps', () => {
    const s = Signal.cellOk(7);
    const s2 = s.flatMap(x => Signal.ok(x + 1));
    s2.reconcile(trace, 1);
    expect(s2.get()).toBe(8);
  });

  it('setOk', () => {
    const s = Signal.cellOk(7);
    s.setOk(8);
    s.reconcile(trace, 1);
    expect(s.get()).toBe(8);
  });

  it('setErr', () => {
    const s = Signal.cellOk(7);
    s.setErr(err);
    s.reconcile(trace, 1);
    expect(() => s.get()).toThrow(err);
  });

  it('unchanged value', () => {
    const s = Signal.cellOk(7);
    expect(s.version).toBe(1);
    s.setOk(7);
    s.reconcile(trace, 1);
    expect(s.version).toBe(1);
    expect(s.get()).toBe(7);
  });

  it('changed value', () => {
    const s = Signal.cellOk(7);
    expect(s.version).toBe(1);
    s.setOk(9);
    s.reconcile(trace, 1);
    expect(s.version).toBe(2);
    expect(s.get()).toBe(9);
  });
});

describe('map', () => {
  it('propagates changes', () => {
    let calls = 0;
    const c = Signal.cellOk(7);
    const m = c.map(x => { calls++; return x + 1; })
    m.reconcile(trace, 1);

    expect(m.get()).toBe(8);
    expect(calls).toBe(1);

    c.setOk(7);
    m.reconcile(trace, 2);
    expect(m.get()).toBe(8);
    expect(calls).toBe(1);

    c.setOk(9);
    m.reconcile(trace, 3);
    expect(m.get()).toBe(10);
    expect(calls).toBe(2);
  });

  it('does not bump version on equal value', () => {
    let calls = 0;
    const c = Signal.cellOk(7);
    const m = c.map(x => { calls++; return x % 2; })
    m.reconcile(trace, 1);

    expect(m.get()).toBe(1);
    expect(calls).toBe(1);
    expect(m.version).toBe(1);

    c.setOk(9);
    m.reconcile(trace, 1);
    expect(m.get()).toBe(1);
    expect(calls).toBe(1);
    expect(m.version).toBe(1);
  });
});

describe('flatMap', () => {
  it('propagates outer changes', () => {
    let calls = 0;
    const c = Signal.cellOk(7);
    const m = c.flatMap(x => { calls++; return Signal.ok(x + 1); })
    m.reconcile(trace, 1);

    expect(m.get()).toBe(8);
    expect(calls).toBe(1);

    c.setOk(7);
    m.reconcile(trace, 2);
    expect(m.get()).toBe(8);
    expect(calls).toBe(1);

    c.setOk(9);
    m.reconcile(trace, 3);
    expect(m.get()).toBe(10);
    expect(calls).toBe(2);
  });

  it('propagates inner changes', () => {
    let calls = 0;
    const c1 = Signal.cellOk(7);
    const c2 = Signal.cellOk(9);
    const m = c1.flatMap(x => c2.map(y => { calls++; return x + y }))
    m.reconcile(trace, 1);

    expect(m.get()).toBe(16);
    expect(calls).toBe(1);

    c2.setOk(11);
    m.reconcile(trace, 2);
    expect(m.get()).toBe(18);
    expect(calls).toBe(2);
  });

  it('does not bump version on equal value', () => {
    let calls = 0;
    const c = Signal.cellOk(7);
    const m = c.flatMap(x => { calls++; return Signal.ok(x % 2); })
    m.reconcile(trace, 1);

    expect(m.get()).toBe(1);
    expect(calls).toBe(1);
    expect(m.version).toBe(1);

    c.setOk(9);
    m.reconcile(trace, 2);
    expect(m.get()).toBe(1);
    expect(calls).toBe(2);
    expect(m.version).toBe(1);
  });
});

describe('join', () => {
  it('joins', () => {
    const c1 = Signal.ok(7);
    const c2 = Signal.ok(9);
    const j = Signal.join(c1, c2);
    j.reconcile(trace, 1);

    expect(j.get()).toEqual([7, 9]);
  });

  it('propagates errors', () => {
    const c1 = Signal.ok(7);
    const c2 = Signal.ok(9);

    const j = Signal.join(Signal.err(err), c2);
    j.reconcile(trace, 1);
    expect(() => j.get()).toThrow(err);

    const j2 = Signal.join(c1, Signal.err(err));
    j2.reconcile(trace, 1);
    expect(() => j2.get()).toThrow(err);
  });

  it('propagates changes', () => {
    let calls = 0;
    const c1 = Signal.cellOk(7);
    const c2 = Signal.cellOk(9);
    const j = Signal.join(c1, c2).map(([t1, t2]) => { calls++; return [t1, t2] });
    j.reconcile(trace, 1);

    expect(j.get()).toEqual([7, 9]);
    expect(calls).toBe(1);

    c1.setOk(7);
    j.reconcile(trace, 2);
    expect(j.get()).toEqual([7, 9]);
    expect(calls).toBe(1);

    c2.setOk(9);
    j.reconcile(trace, 3);
    expect(j.get()).toEqual([7, 9]);
    expect(calls).toBe(1);

    c1.setOk(11);
    j.reconcile(trace, 4);
    expect(j.get()).toEqual([11, 9]);
    expect(calls).toBe(2);
  });
});

describe('joinImmutableMap', () => {
  it('joins', () => {
    const c1 = Signal.ok(7);
    const c2 = Signal.ok(9);
    const map = Signal.ok(Immutable.Map({ c1, c2 }));
    const j = Signal.joinImmutableMap(map);
    j.reconcile(trace, 1);

    expect(j.get()).toEqual(Immutable.Map({ c1: 7, c2: 9 }));
  });

  it('propagates errors', () => {
    const c1 = Signal.ok(7);
    const c2 = Signal.err(err);
    const map = Signal.ok(Immutable.Map({ c1, c2 }));
    const j = Signal.joinImmutableMap(map);
    j.reconcile(trace, 1);

    expect(() => j.get()).toThrow(err);
  });

  it('propagates outer changes', () => {
    let calls = 0;
    const c1 = Signal.ok(7);
    const c2 = Signal.ok(9);
    const map = Signal.cellOk(Immutable.Map({ c1, c2 }));
    const j = Signal.joinImmutableMap(map).map(map => { calls++; return map });
    j.reconcile(trace, 1);

    expect(j.get()).toEqual(Immutable.Map({ c1: 7, c2: 9 }));
    expect(calls).toBe(1);

    const c3 = Signal.ok(11);
    map.setOk(Immutable.Map({ c1, c3 }));
    j.reconcile(trace, 2);
    expect(j.get()).toEqual(Immutable.Map({ c1: 7, c3: 11 }));
    expect(calls).toBe(2);
  });

  it('propagates inner changes', () => {
    let calls = 0;
    const c1 = Signal.cellOk(7);
    const c2 = Signal.cellOk(9);
    const map = Signal.ok(Immutable.Map({ c1, c2 }));
    const j = Signal.joinImmutableMap(map).map(map => { calls++; return map });
    j.reconcile(trace, 1);

    expect(j.get()).toEqual(Immutable.Map({ c1: 7, c2: 9 }));
    expect(calls).toBe(1);

    c1.setOk(11);
    j.reconcile(trace, 2);
    expect(j.get()).toEqual(Immutable.Map({ c1: 11, c2: 9 }));
    expect(calls).toBe(2);
  });
});

describe('mapImmutableMap', () => {
  let calls = 0;
  function f(x: number) { calls++; return x + 1; }
  const map = Signal.cellOk(Immutable.Map({ a: 7, b: 9 }));
  const fmap = Signal.mapImmutableMap(map, f);
  fmap.reconcile(trace, 1);

  expect(fmap.get()).toEqual(Immutable.Map({ a: 8, b: 10 }));
  expect(calls).toBe(2);

  map.setOk(map.get().set('b', 10));
  fmap.reconcile(trace, 2);
  expect(fmap.get()).toEqual(Immutable.Map({ a: 8, b: 11 }));
  expect(calls).toBe(3);

  map.setOk(map.get().set('c', 13));
  fmap.reconcile(trace, 3);
  expect(fmap.get()).toEqual(Immutable.Map({ a: 8, b: 11, c: 14 }));
  expect(calls).toBe(4);

  map.setOk(map.get().delete('a'));
  fmap.reconcile(trace, 4);
  expect(fmap.get()).toEqual(Immutable.Map({ b: 11, c: 14 }));
  expect(calls).toBe(4);
});
