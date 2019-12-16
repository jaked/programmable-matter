import Try from './index';

const err = new Error('fail');

describe('ok', () => {
  const t = Try.ok(7);

  it('is ok', () => {
    expect(t.type === 'ok' && t.ok).toBe(7);
    expect(t.get()).toBe(7);
  });

  it('maps', () => {
    const t2 = t.map(x => x + 1);
    expect(t2.type === 'ok' && t2.ok).toBe(8);
  });

  it('map catches exceptions', () => {
    const t2 = t.map(x => { throw err });
    expect(t2.type === 'err' && t2.err).toBe(err);
  });

  it('flatMaps', () => {
    const t2 = t.flatMap(x => Try.ok(x + 1));
    expect(t2.type === 'ok' && t2.ok).toBe(8);
  });

  it('flatMap catches exceptions', () => {
    const t2 = t.flatMap(x => { throw err });
    expect(t2.type === 'err' && t2.err).toBe(err);
  });

  it('forEaches', () => {
    let called = false;
    t.forEach(x => called = true);
    expect(called).toBe(true);
  });
});

describe('err', () => {
  const t = Try.err(err);

  it('is err', () => {
    expect(t.type === 'err' && t.err).toBe(err);
    expect(() => t.get()).toThrow(err);
  });

  it('maps', () => {
    const t2 = t.map(x => x + 1);
    expect(t2.type === 'err' && t2.err).toBe(err);
  });

  it('flatMaps', () => {
    const t2 = t.flatMap(x => Try.ok(x + 1));
    expect(t2.type === 'err' && t2.err).toBe(err);
  });

  it('forEaches', () => {
    let called = false;
    t.forEach(x => called = true);
    expect(called).toBe(false);
  });
});

describe('apply', () => {
  it('ok', () => {
    const t = Try.apply(() => 7);
    expect(t.type === 'ok' && t.ok).toBe(7);
  });

  it('err', () => {
    const t = Try.apply(() => { throw err });
    expect(t.type === 'err' && t.err).toBe(err);
  });
});

describe('joinMap', () => {
  it('ok', () => {
    const t1 = Try.ok(7);
    const t2 = Try.ok(9);
    const t = Try.joinMap(t1, t2, (t1, t2) => [t1, t2]);
    expect(t.type === 'ok' && t.ok).toEqual([7, 9]);
  });

  it('t1 err', () => {
    const t1 = Try.err(err);
    const t2 = Try.ok(9);
    const t = Try.joinMap(t1, t2, (t1, t2) => [t1, t2]);
    expect(t.type === 'err' && t.err).toBe(err);
  });

  it('t2 err', () => {
    const t1 = Try.ok(7);
    const t2 = Try.err(err);
    const t = Try.joinMap(t1, t2, (t1, t2) => [t1, t2]);
    expect(t.type === 'err' && t.err).toBe(err);
  });

  it('both err', () => {
    const t1 = Try.err(err);
    const t2 = Try.err(new Error('fail 2'));
    const t = Try.joinMap(t1, t2, (t1, t2) => [t1, t2]);
    expect(t.type === 'err' && t.err).toBe(err);
  });

  it('catches exceptions', () => {
    const t1 = Try.ok(7);
    const t2 = Try.ok(9);
    const t = Try.joinMap(t1, t2, (t1, t2) => { throw err });
    expect(t.type === 'err' && t.err).toBe(err);
  });
});
