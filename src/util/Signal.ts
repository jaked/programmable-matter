import deepEqual from 'deep-equal';
import * as Try from './Try';

/**
 * simple implementation of reactive values
 * update is by top-down reevaluation,
 * with dirty node tracking as an optimization
 */
export interface Signal<T> {
  get: () => T;
  map<U>(f: (t: T) => U): Signal<U>;

  /**
   * restricted `flatMap`; `f` must return a `Signal`
   * that is already up-to-date with respect to its cells
   * (e.g. by constructing it fresh)
   * to choose between existing signals, use `ifThenElse`
   * TODO(jaked) find a way to enforce this, maybe arrows?
   */
  flatMap<U>(f: (t: T) => Signal<U>): Signal<U>;

  /**
   * current value of this signal.
   * not valid if a dependent cell is dirty.
   */
  value: Try.Try<T>;

  // TODO(jaked) how can we make these private to impl?

  /**
   * if `value` differs at two points in time,
   * `version` also differs.
   */
  version: number;

  /**
   * a signal is dirty if calling `update` might change its
   * value. `isDirty` is valid only after a call to `dirty()`
   * with no intervening dirtying of a dependent cell.
   */
  isDirty: boolean;

  /**
   * compute `isDirty` by checking dirtiness of children,
   * return `isDirty`
   */
  dirty(): boolean;

  /**
   * update this signal, recomputing `value` as needed.
   * after update, `isDirty` is false.
   * only safe to call after a call to `dirty()`
   * with no intervening dirtying of a dependent cell.
   */
  update(): void;
}

function checkNotDirty<T>(s: Signal<T>) {
  // a dirty cell doesn't need updating, so it's safe to use its value
  if (s instanceof CellImpl) return;
  if (s.isDirty) throw new Error('expected non-dirty signal');
}

class Const<T> implements Signal<T> {
  constructor(value: Try.Try<T>) {
    this.value = value;
  }

  get() { return this.value.get(); }
  map<U>(f: (t: T) => U) { return new Map(this, f); }
  flatMap<U>(f: (t: T) => Signal<U>) { return new FlatMap(this, f); }

  value: Try.Try<T>;
  version: 0 = 0;
  isDirty: false = false;
  dirty() { return false; }
  update() { }
}

export interface Cell<T> extends Signal<T> {
  set(t: Try.Try<T>): void;
  setOk(t: T): void;
  setErr(err: Error): void;
}

class CellImpl<T> implements Cell<T> {
  constructor(value: Try.Try<T>) {
    this.value = value;
    this.version = 0;
    this.isDirty = false;
  }

  get() { return this.value.get(); }
  map<U>(f: (t: T) => U) { return new Map(this, f); }
  flatMap<U>(f: (t: T) => Signal<U>) { return new FlatMap(this, f); }

  value: Try.Try<T>;
  version: number;
  isDirty: boolean;
  dirty() { return this.isDirty; }
  update() { this.isDirty = false; }

  set(t: Try.Try<T>) {
    if (deepEqual(t, this.value)) return;
    this.value = t;
    this.version++;
    this.isDirty = true;
  }
  setOk(t: T) { this.set(Try.ok(t)); }
  setErr(err: Error) { this.set(Try.err(err)); }
}

class Map<T, U> implements Signal<U> {
  s: Signal<T>;
  sVersion: number;
  f: (t: T) => U;

  constructor(s: Signal<T>, f: (t: T) => U) {
    checkNotDirty(s);
    this.version = 0;
    this.sVersion = s.version;
    this.isDirty = false;
    this.s = s;
    this.f = f;
    this.value = s.value.map(f);
  }

  get() { return this.value.get(); }
  map<V>(f: (t: U) => V) { return new Map(this, f); }
  flatMap<V>(f: (t: U) => Signal<V>) { return new FlatMap(this, f); }

  value: Try.Try<U>;
  version: number;
  isDirty: boolean;
  dirty() {
    // TODO(jaked)
    // it's not safe to
    //   if (this.isDirty) return isDirty;
    // because sub-trees that are not visited by `update()`
    // are not undirtied, so `isDirty` might be stale.
    return (this.isDirty = this.s.dirty());
  }
  update() {
    if (!this.isDirty) return;
    this.isDirty = false;
    this.s.update();
    if (this.sVersion === this.s.version) return;
    this.sVersion = this.s.version;
    const value = this.s.value.map(this.f);
    if (deepEqual(value, this.value)) return;
    this.value = value;
    this.version++;
  }
}

class FlatMap<T, U> implements Signal<U> {
  s: Signal<T>;
  sVersion: number;
  f: (t: T) => Signal<U>;

  constructor(s: Signal<T>, f: (t: T) => Signal<U>) {
    checkNotDirty(s);
    this.version = 0;
    this.sVersion = s.version;
    this.isDirty = false;
    this.s = s;
    this.f = f;
    if (s.value.type === 'ok') {
      const fs = f(s.value.ok);
      checkNotDirty(fs); // doesn't hurt
      this.value = fs.value;
    } else {
      this.value = <Try.Try<U>><unknown>s.value;
    }
  }

  get() { return this.value.get(); }
  map<V>(f: (t: U) => V) { return new Map(this, f); }
  flatMap<V>(f: (t: U) => Signal<V>) { return new FlatMap(this, f); }

  value: Try.Try<U>;
  version: number;
  isDirty: boolean;
  dirty() {
    return (this.isDirty = this.s.dirty());
  }
  update() {
    if (!this.isDirty) return;
    this.isDirty = false;
    this.s.update();
    if (this.sVersion === this.s.version) return;
    this.sVersion = this.s.version;
    let value: Try.Try<U>;
    if (this.s.value.type === 'ok') {
      // if `f` returns an out-of-date `Signal`, we can't
      // correctly update it, because we didn't get a chance to
      // call `dirty()` on it. we can't call `dirty()` here because
      // we might already have un-dirtied an underlying cell.
      const fs = this.f(this.s.value.ok);
      checkNotDirty(fs); // doesn't hurt
      value = fs.value;
    } else {
      value = <Try.Try<U>><unknown>this.s.value;
    }
    if (deepEqual(value, this.value)) return;
    this.value = value;
    this.version++;
  }
}

class JoinMap<T1, T2, R> implements Signal<R> {
  s1: Signal<T1>;
  s1Version: number;
  s2: Signal<T2>;
  s2Version: Number;
  f: (t1: T1, t2: T2) => R;

  constructor(
    s1: Signal<T1>,
    s2: Signal<T2>,
    f: (t1: T1, t2: T2) => R
  ) {
    checkNotDirty(s1);
    checkNotDirty(s2);
    this.version = 0;
    this.s1Version = s1.version;
    this.s2Version = s2.version;
    this.isDirty = false;
    this.s1 = s1;
    this.s2 = s2;
    this.f = f;
    this.value = Try.joinMap2(s1.value, s2.value, f);
  }

  get() { return this.value.get(); }
  map<V>(f: (t: R) => V) { return new Map(this, f); }
  flatMap<V>(f: (t: R) => Signal<V>) { return new FlatMap(this, f); }

  value: Try.Try<R>;
  version: number;
  isDirty: boolean;
  dirty() {
    return (this.isDirty = (this.s1.dirty() || this.s2.dirty()));
  }
  update() {
    if (!this.isDirty) return;
    this.isDirty = false;
    this.s1.update();
    this.s2.update();
    if (this.s1Version === this.s1.version &&
        this.s2Version === this.s2.version)
      return;
    this.s1Version = this.s1.version;
    this.s2Version = this.s2.version;
    const value = Try.joinMap2(this.s1.value, this.s2.value, this.f);
    if (deepEqual(value, this.value)) return;
    this.value = value;
    this.version++;
  }
}

class IfThenElse<I, TE> implements Signal<TE> {
  i: Signal<I>;
  iVersion: number;
  t: Signal<TE>;
  tVersion: number;
  e: Signal<TE>;
  eVersion: number;

  constructor(
    i: Signal<I>,
    t: Signal<TE>,
    e: Signal<TE>
  ) {
    checkNotDirty(i);
    checkNotDirty(t);
    checkNotDirty(e);
    this.version = 0;
    this.iVersion = i.version;
    this.tVersion = t.version;
    this.eVersion = e.version;
    this.isDirty = false;
    this.i = i;
    this.t = t;
    this.e = e;
    this.value = i.value.flatMap(i => i ? t.value : e.value);
  }

  get() { return this.value.get(); }
  map<V>(f: (t: TE) => V) { return new Map(this, f); }
  flatMap<V>(f: (t: TE) => Signal<V>) { return new FlatMap(this, f); }

  value: Try.Try<TE>;
  version: number;
  isDirty: boolean;
  dirty() {
    return (this.isDirty = (this.i.dirty() || this.t.dirty() || this.e.dirty()));
  }
  update() {
    if (!this.isDirty) return;
    this.isDirty = false;
    this.i.update();
    this.t.update();
    this.e.update();
    if (this.iVersion === this.i.version &&
        this.tVersion === this.t.version &&
        this.eVersion === this.e.version)
      return;
    this.iVersion = this.i.version;
    this.tVersion = this.t.version;
    this.eVersion = this.e.version;
    const value = this.i.value.flatMap(i => i ? this.t.value : this.e.value);
    if (deepEqual(value, this.value)) return;
    this.value = value;
    this.version++;
  }
}

export function update<T>(signal: Signal<T>): void {
  if (signal.dirty())
    signal.update();
}

export function run<T>(signal: Signal<T>): T {
  update(signal);
  return signal.get();
}

export function constant<T>(t: Try.Try<T>): Signal<T> {
  return new Const(t);
}

export function ok<T>(t: T): Signal<T> {
  return constant(Try.ok(t));
}

export function err(err: Error): Signal<never> {
  return constant(Try.err(err));
}

export function cell<T>(t: Try.Try<T>): Cell<T> {
  return new CellImpl(t);
}

export function cellOk<T>(t: T): Cell<T> {
  return cell(Try.ok(t));
}

export function cellErr<T>(err: Error): Cell<T> {
  return cell<T>(Try.err(err));
}

export function joinMap<T1, T2, R>(
  s1: Signal<T1>,
  s2: Signal<T2>,
  f: (t1: T1, t2: T2) => R
): Signal<R> {
  return new JoinMap(s1, s2, f);
}

export function ifThenElse<I, TE>(
  i: Signal<I>,
  t: Signal<TE>,
  e: Signal<TE>
): Signal<TE> {
  return new IfThenElse(i, t, e);
}
