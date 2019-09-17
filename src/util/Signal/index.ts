import deepEqual from 'deep-equal';
import * as Immutable from 'immutable';
import Try from '../Try';

/**
 * Simple implementation of reactive values. Update is by top-down
 * reevaluation.
 *
 * A signal has a value, and a "version". Whenever an update changes a
 * signal's value, the version is also incremented. Signals track the
 * versions of their children, in order to determine if they need to be
 * recomputed.
 *
 * A signal is up-to-date with respect to a "level", a
 * monotonically-increasing counter. To update a signal, call `update`
 * with a level larger than any level in the DAG rooted at the signal. A
 * signal's level is no larger than the levels of its children.
 *
 * When `update` is called on a signal, if it is already at the given
 * level then no update is needed, so signals reached by more than one
 * path from the root are updated only once. Otherwise, the signal's
 * children are updated to the given level, and if any of their versions
 * have changed, the signal is recomputed.
 *
 * Some nodes in the DAG may not be reached by an update. (E.g. in
 * `b.flatMap(b => b ? s1 : s2)`, if `b` has not changed then `s1` and
 * `s2` are not reached; if it has, only one of them is reached.). If
 * they are reached by a later update, they'll be brought up to date as
 * needed.
 *
 * There can be multiple roots, or even multiple disjoint DAGs; only the
 * parts needed for a particular update are brought up to date.
 */
interface Signal<T> {
  /**
   * equivalent to `.value.get()`
   */
  get: () => T;

  map<U>(f: (t: T) => U): Signal<U>;
  flatMap<U>(f: (t: T) => Signal<U>): Signal<U>;

  /**
   * value of this signal, up-to-date with respect to `level`.
   */
  value: Try<T>;

  // TODO(jaked) how can we make these private to impl?

  /**
   * if an update changes `value`, `version` is incremented.
   */
  version: number;

  /**
   * level of the last `update()` on this signal.
   */
  level: number;

  /**
   * update this signal to `level`, recomputing `value` as needed.
   * if signal is already at (or above) `level` it need not be recomputed.
   *
   * `update` must be called with monotonically increasing numbers.
   */
  update(level: number): void;
}

class Const<T> implements Signal<T> {
  constructor(value: Try<T>) {
    this.value = value;
  }

  get() { return this.value.get(); }
  map<U>(f: (t: T) => U) { return new Map(this, f); }
  flatMap<U>(f: (t: T) => Signal<U>) { return new FlatMap(this, f); }

  value: Try<T>;
  get version(): 0 { return 0; }
  // don't need to track `level` because `update` is a no-op
  get level(): 0 { return 0; }
  update(level: number) { }
}

interface CellIntf<T> extends Signal<T> {
  set(t: Try<T>): void;
  setOk(t: T): void;
  setErr(err: Error): void;
}

class CellImpl<T> implements CellIntf<T> {
  constructor(value: Try<T>) {
    this.value = value;
    this.version = 0;
  }

  get() { return this.value.get(); }
  map<U>(f: (t: T) => U) { return new Map(this, f); }
  flatMap<U>(f: (t: T) => Signal<U>) { return new FlatMap(this, f); }

  value: Try<T>;
  version: number;
  // don't need to track `level` because `update` is a no-op
  get level(): 0 { return 0; }
  update(level: number) { }

  set(t: Try<T>) {
    if (equal(t, this.value)) return;
    this.value = t;
    this.version++;
  }
  setOk(t: T) { this.set(Try.ok(t)); }
  setErr(err: Error) { this.set(Try.err(err)); }
}

class Map<T, U> implements Signal<U> {
  s: Signal<T>;
  sVersion: number;
  f: (t: T) => U;

  constructor(s: Signal<T>, f: (t: T) => U) {
    this.version = 0;
    this.sVersion = s.version;
    this.s = s;
    this.f = f;
    this.value = s.value.map(f);
    this.level = s.level;
  }

  get() { return this.value.get(); }
  map<V>(f: (t: U) => V) { return new Map(this, f); }
  flatMap<V>(f: (t: U) => Signal<V>) { return new FlatMap(this, f); }

  value: Try<U>;
  version: number;
  level: number;
  update(level: number) {
    if (this.level === level) return;
    this.level = level;
    this.s.update(level);
    if (this.sVersion === this.s.version) return;
    this.sVersion = this.s.version;
    const value = this.s.value.map(this.f);
    if (equal(value, this.value)) return;
    this.value = value;
    this.version++;
  }
}

class FlatMap<T, U> implements Signal<U> {
  s: Signal<T>;
  sVersion: number;
  f: (t: T) => Signal<U>;

  constructor(s: Signal<T>, f: (t: T) => Signal<U>) {
    this.version = 0;
    this.sVersion = s.version;
    this.s = s;
    this.f = f;
    if (s.value.type === 'ok') {
      const fs = f(s.value.ok);
      this.value = fs.value;
      this.level = Math.min(s.level, fs.level);
    } else {
      this.value = <Try<U>><unknown>s.value;
      this.level = s.level;
    }
  }

  get() { return this.value.get(); }
  map<V>(f: (t: U) => V) { return new Map(this, f); }
  flatMap<V>(f: (t: U) => Signal<V>) { return new FlatMap(this, f); }

  value: Try<U>;
  version: number;
  level: number;
  update(level: number) {
    if (this.level === level) return;
    this.level = level;
    this.s.update(level);
    if (this.sVersion === this.s.version) return;
    this.sVersion = this.s.version;
    let value: Try<U>;
    if (this.s.value.type === 'ok') {
      const fs = this.f(this.s.value.ok);
      fs.update(level);
      value = fs.value;
    } else {
      value = <Try<U>><unknown>this.s.value;
    }
    if (equal(value, this.value)) return;
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
    this.version = 0;
    this.s1Version = s1.version;
    this.s2Version = s2.version;
    this.s1 = s1;
    this.s2 = s2;
    this.f = f;
    this.value = Try.joinMap2(s1.value, s2.value, f);
    this.level = Math.min(s1.level, s2.level);
  }

  get() { return this.value.get(); }
  map<V>(f: (t: R) => V) { return new Map(this, f); }
  flatMap<V>(f: (t: R) => Signal<V>) { return new FlatMap(this, f); }

  value: Try<R>;
  version: number;
  level: number;
  update(level: number) {
    if (this.level === level) return;
    this.level = level;
    this.s1.update(level);
    this.s2.update(level);
    if (this.s1Version === this.s1.version &&
        this.s2Version === this.s2.version)
      return;
    this.s1Version = this.s1.version;
    this.s2Version = this.s2.version;
    const value = Try.joinMap2(this.s1.value, this.s2.value, this.f);
    if (equal(value, this.value)) return;
    this.value = value;
    this.version++;
  }
}

function equal(v1: any, v2: any): boolean {
  if (Immutable.isValueObject(v1) && Immutable.isValueObject(v2)) {
    return Immutable.is(v1, v2);
  } else {
    return deepEqual(v1, v2);
  }
}

module Signal {
  export function constant<T>(t: Try<T>): Signal<T> {
    return new Const(t);
  }

  export function ok<T>(t: T): Signal<T> {
    return constant(Try.ok(t));
  }

  export function err(err: Error): Signal<never> {
    return constant(Try.err(err));
  }

  export function cell<T>(t: Try<T>): Cell<T> {
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

  export type Cell<T> = CellIntf<T>;
}

export default Signal;
