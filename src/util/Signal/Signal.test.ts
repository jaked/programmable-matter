import * as Immutable from 'immutable';
import Signal from './index';
import Try from '../Try';

const err = new Error('fail');

describe('constant', () => {
  describe('ok', () => {
    const s = Signal.ok(7);

    it('is ok', () => {
      expect(s.get()).toBe(7);
    });

    it('maps', () => {
      const s2 = s.map(x => x + 1);
      s2.reconcile();
      expect(s2.get()).toBe(8);
    });

    it('flatMaps', () => {
      const s2 = s.flatMap(x => Signal.ok(x + 1));
      s2.reconcile();
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
      s2.reconcile();
      expect(() => s2.get()).toThrow(err);
    });

    it('flatMaps', () => {
      const s2 = s.flatMap(x => Signal.ok(x + 1));
      s2.reconcile();
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
    s2.reconcile();
    expect(s2.get()).toBe(8);
  });

  it('flatMaps', () => {
    const s = Signal.cellOk(7);
    const s2 = s.flatMap(x => Signal.ok(x + 1));
    s2.reconcile();
    expect(s2.get()).toBe(8);
  });

  it('setOk', () => {
    const s = Signal.cellOk(7);
    s.setOk(8);
    s.reconcile();
    expect(s.get()).toBe(8);
  });

  it('setErr', () => {
    const s = Signal.cellOk(7);
    s.setErr(err);
    s.reconcile();
    expect(() => s.get()).toThrow(err);
  });

  it('unchanged value', () => {
    const s = Signal.cellOk(7);
    expect(s.version).toBe(1);
    s.setOk(7);
    s.reconcile();
    expect(s.version).toBe(1);
    expect(s.get()).toBe(7);
  });

  it('unchanged value + force', () => {
    const s = Signal.cellOk(7);
    expect(s.version).toBe(1);
    s.setOk(7, true);
    s.reconcile();
    expect(s.version).toBe(2);
    expect(s.get()).toBe(7);
  });

  it('changed value', () => {
    const s = Signal.cellOk(7);
    expect(s.version).toBe(1);
    s.setOk(9);
    s.reconcile();
    expect(s.version).toBe(2);
    expect(s.get()).toBe(9);
  });
});

describe('map', () => {
  it('propagates changes', () => {
    let calls = 0;
    const c = Signal.cellOk(7);
    const m = c.map(x => { calls++; return x + 1; })
    m.reconcile();

    expect(m.get()).toBe(8);
    expect(calls).toBe(1);

    c.setOk(7);
    m.reconcile();
    expect(m.get()).toBe(8);
    expect(calls).toBe(1);

    c.setOk(9);
    m.reconcile();
    expect(m.get()).toBe(10);
    expect(calls).toBe(2);
  });

  it('propagates dirty bit', () => {
    const c = Signal.cellOk(7);
    const m = c.map(x => x + 1);
    const n = m.map(x => x + 1);
    n.reconcile();
    expect(m.isDirty).toBe(false);
    expect(n.isDirty).toBe(false);
    c.setOk(9);
    expect(m.isDirty).toBe(true);
    expect(n.isDirty).toBe(true);
  });

  it('does not bump version on equal value', () => {
    let calls = 0;
    const c = Signal.cellOk(7);
    const m = c.map(x => { calls++; return x % 2; })
    m.reconcile();

    expect(m.get()).toBe(1);
    expect(calls).toBe(1);
    expect(m.version).toBe(1);

    c.setOk(9);
    m.reconcile();
    expect(m.get()).toBe(1);
    expect(calls).toBe(2);
    expect(m.version).toBe(1);
  });

  it('handles errors in function', () => {
    const c = Signal.cellOk(7);
    const m = c.map(x => { throw 'fail' });

    expect(() => m.reconcile()).not.toThrow();
    expect(() => m.get()).toThrow();
  });
});

describe('flatMap', () => {
  it('propagates outer changes', () => {
    let calls = 0;
    const c = Signal.cellOk(7);
    const m = c.flatMap(x => { calls++; return Signal.ok(x + 1); })
    m.reconcile();

    expect(m.get()).toBe(8);
    expect(calls).toBe(1);

    c.setOk(7);
    m.reconcile();
    expect(m.get()).toBe(8);
    expect(calls).toBe(1);

    c.setOk(9);
    m.reconcile();
    expect(m.get()).toBe(10);
    expect(calls).toBe(2);
  });

  it('propagates inner changes', () => {
    let calls = 0;
    const c1 = Signal.cellOk(7);
    const c2 = Signal.cellOk(9);
    const m = c1.flatMap(x => c2.map(y => { calls++; return x + y }))
    m.reconcile();

    expect(m.get()).toBe(16);
    expect(calls).toBe(1);

    c2.setOk(11);
    m.reconcile();
    expect(m.get()).toBe(18);
    expect(calls).toBe(2);
  });

  it('does not bump version on outer equal value', () => {
    let calls = 0;
    const c = Signal.cellOk(7);
    const m = c.flatMap(x => { calls++; return Signal.ok(x % 2); })
    m.reconcile();

    expect(m.get()).toBe(1);
    expect(calls).toBe(1);
    expect(m.version).toBe(1);

    c.setOk(9);
    m.reconcile();
    expect(m.get()).toBe(1);
    expect(calls).toBe(2);
    expect(m.version).toBe(1);
  });

  it('does not bump version on inner equal value', () => {
    let outerCalls = 0;
    let innerCalls = 0;
    const c = Signal.cellOk(7);
    const m = Signal.ok(11).flatMap(x => {
      outerCalls++;
      return c.map(y => {
        innerCalls++;
        return y % 2
      });
    })
    m.reconcile();

    expect(m.get()).toBe(1);
    expect(outerCalls).toBe(1);
    expect(innerCalls).toBe(1);
    expect(m.version).toBe(1);

    c.setOk(9);
    m.reconcile();
    expect(m.get()).toBe(1);
    expect(outerCalls).toBe(1);
    expect(innerCalls).toBe(2);
    expect(m.version).toBe(1);
  });

  it('handles errors in function', () => {
    const c = Signal.cellOk(7);
    const m = c.flatMap(x => { throw 'fail' });

    expect(() => m.reconcile()).not.toThrow();
    expect(() => m.get()).toThrow();
  });
});

describe('liftToTry', () => {
  it('lifts ok', () => {
    const c = Signal.ok(7);
    const s = c.liftToTry();
    s.reconcile();
    expect(s.get()).toEqual(Try.ok(7));
  });

  it('lifts err', () => {
    const err = new Error('error!');
    const c = Signal.err(err);
    const s = c.liftToTry();
    s.reconcile();
    expect(s.get()).toEqual(Try.err(err));
  });
});

describe('join', () => {
  it('joins', () => {
    const c1 = Signal.ok(7);
    const c2 = Signal.ok(9);
    const j = Signal.join(c1, c2);
    j.reconcile();

    expect(j.get()).toEqual([7, 9]);
  });

  it('propagates errors', () => {
    const c1 = Signal.ok(7);
    const c2 = Signal.ok(9);

    const j = Signal.join(Signal.err(err), c2);
    j.reconcile();
    expect(() => j.get()).toThrow(err);

    const j2 = Signal.join(c1, Signal.err(err));
    j2.reconcile();
    expect(() => j2.get()).toThrow(err);
  });

  it('propagates changes', () => {
    let calls = 0;
    const c1 = Signal.cellOk(7);
    const c2 = Signal.cellOk(9);
    const j = Signal.join(c1, c2).map(([t1, t2]) => { calls++; return [t1, t2] });
    j.reconcile();

    expect(j.get()).toEqual([7, 9]);
    expect(calls).toBe(1);

    c1.setOk(7);
    j.reconcile();
    expect(j.get()).toEqual([7, 9]);
    expect(calls).toBe(1);

    c2.setOk(9);
    j.reconcile();
    expect(j.get()).toEqual([7, 9]);
    expect(calls).toBe(1);

    c1.setOk(11);
    j.reconcile();
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
    j.reconcile();

    expect(j.get()).toEqual(Immutable.Map({ c1: 7, c2: 9 }));
  });

  it('propagates errors', () => {
    const c1 = Signal.ok(7);
    const c2 = Signal.err(err);
    const map = Signal.ok(Immutable.Map({ c1, c2 }));
    const j = Signal.joinImmutableMap(map);
    j.reconcile();

    expect(() => j.get()).toThrow(err);
  });

  it('propagates outer changes', () => {
    let calls = 0;
    const c1 = Signal.ok(7);
    const c2 = Signal.ok(9);
    const map = Signal.cellOk(Immutable.Map({ c1, c2 }));
    const j = Signal.joinImmutableMap(map).map(map => { calls++; return map });
    j.reconcile();

    expect(j.get()).toEqual(Immutable.Map({ c1: 7, c2: 9 }));
    expect(calls).toBe(1);

    const c3 = Signal.ok(11);
    map.setOk(Immutable.Map({ c1, c3 }));
    j.reconcile();
    expect(j.get()).toEqual(Immutable.Map({ c1: 7, c3: 11 }));
    expect(calls).toBe(2);
  });

  it('propagates inner changes', () => {
    let calls = 0;
    const c1 = Signal.cellOk(7);
    const c2 = Signal.cellOk(9);
    const map = Signal.ok(Immutable.Map({ c1, c2 }));
    const j = Signal.joinImmutableMap(map).map(map => { calls++; return map });
    j.reconcile();

    expect(j.get()).toEqual(Immutable.Map({ c1: 7, c2: 9 }));
    expect(calls).toBe(1);

    c1.setOk(11);
    j.reconcile();
    expect(j.get()).toEqual(Immutable.Map({ c1: 11, c2: 9 }));
    expect(calls).toBe(2);
  });

  it('handles no signals', () => {
    const s = Signal.join(...[]);
    s.reconcile();
    expect(s.get()).toEqual([]);
  });
});

describe('mapImmutableMap', () => {
  let calls = 0;
  function f(x: number) { calls++; return x + 1; }
  const map = Signal.cellOk(Immutable.Map({ a: 7, b: 9 }));
  const fmap = Signal.mapImmutableMap(map, f);
  fmap.reconcile();

  expect(fmap.get()).toEqual(Immutable.Map({ a: 8, b: 10 }));
  expect(calls).toBe(2);

  map.setOk(map.get().set('b', 10));
  fmap.reconcile();
  expect(fmap.get()).toEqual(Immutable.Map({ a: 8, b: 11 }));
  expect(calls).toBe(3);

  map.setOk(map.get().set('c', 13));
  fmap.reconcile();
  expect(fmap.get()).toEqual(Immutable.Map({ a: 8, b: 11, c: 14 }));
  expect(calls).toBe(4);

  map.setOk(map.get().delete('a'));
  fmap.reconcile();
  expect(fmap.get()).toEqual(Immutable.Map({ b: 11, c: 14 }));
  expect(calls).toBe(4);
});

describe('ref', () => {
  it('throws exception if unset', () => {
    const r = Signal.ref();
    expect(() => r.get()).toThrow();
  });

  it('passes through to underlying signal once set', () => {
    const r = Signal.ref();
    const s = Signal.cellOk('foo');
    r.set(s);
    r.reconcile();
    expect(r.get()).toBe('foo');

    s.setOk('bar');
    r.reconcile();
    expect(r.get()).toBe('bar');
    expect(r.version).toBe(s.version);
  });

  it('cannot be set more than once', () => {
    const r = Signal.ref();
    r.set(Signal.ok('foo'));
    expect(() => r.set(Signal.ok('bar'))).toThrow();
  });
});

describe('mapWritable', () => {
  it('set pushes down inverse mapping', () => {
    const cell = Signal.cellOk(7);
    const plus = cell.mapWritable(x => x + 1, x => x - 1);
    const plusplus = plus.map(x => x + 1);
    plus.reconcile();
    plus.setOk(9);
    expect(cell.get()).toBe(8);
    expect(plus.isDirty).toBe(false);
    // plusplus was dirties even though plus is clean
    plusplus.reconcile();
    expect(plusplus.get()).toBe(10);
  });

  it('unchanged value', () => {
    const cell = Signal.cellOk(7);
    expect(cell.version).toBe(1);
    const plus = cell.mapWritable(x => x + 1, x => x - 1);
    plus.reconcile();
    plus.setOk(8);
    expect(cell.version).toBe(1);
    expect(cell.get()).toBe(7);
  });

  it('unchanged value + force', () => {
    const cell = Signal.cellOk(7);
    expect(cell.version).toBe(1);
    const plus = cell.mapWritable(x => x + 1, x => x - 1);
    plus.reconcile();
    plus.setOk(8, true);
    expect(cell.version).toBe(2);
    expect(cell.get()).toBe(7);
  });
});
