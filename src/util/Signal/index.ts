import deepEqual from 'deep-equal';
import * as Immutable from 'immutable';
import Trace from '../Trace';
import Try from '../Try';

/**
 * Simple implementation of reactive values. Reconciliation is by
 * top-down reevaluation.
 *
 * A signal has a value, and a "version". When reconciliation changes a
 * signal's value, the version is incremented. Signals track the
 * versions of their children, in order to determine if they need to be
 * recomputed.
 *
 * A signal is reconciled with respect to a "level", a
 * monotonically-increasing counter. To reconcile a signal, call
 * `reconcile` with a level larger than any level in the DAG rooted at
 * the signal. A signal's level is no larger than the levels of its
 * children.
 *
 * When `reconcile` is called on a signal, if it is already at the given
 * level then nothing need be done, so signals reached by more than one
 * path from the root are reconciled only once. Otherwise, the signal's
 * children are reconciled to the given level, and if any of their versions
 * have changed, the signal is recomputed.
 *
 * Some nodes in the DAG may not be reached by a call to `reconcile`.
 * (E.g. in `b.flatMap(b => b ? s1 : s2)`, if `b` has not changed then
 * `s1` and `s2` are not reached; if it has, only one of them is reached.).
 * If they are reached by a later call to `reconcile`, they'll be reconciled
 * then.
 *
 * In the same way there can be multiple roots, or even multiple disjoint DAGs;
 * only the parts reached by a call to `reconcile` are reconciled.
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
   * reconcile this signal to `level`, recomputing `value` as needed.
   * if signal is already at (or above) `level` it need not be recomputed.
   *
   * `reconcile` must be called with monotonically increasing numbers.
   */
  reconcile(trace: Trace, level: number): void;
}

function equal(v1: any, v2: any): boolean {
  if (Immutable.isValueObject(v1) && Immutable.isValueObject(v2)) {
    return Immutable.is(v1, v2);
  } else {
    return deepEqual(v1, v2);
  }
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
  reconcile(trace: Trace, level: number) { }
}

interface CellIntf<T> extends Signal<T> {
  set(t: Try<T>): void;
  setOk(t: T): void;
  setErr(err: Error): void;
}

class CellImpl<T> implements CellIntf<T> {
  constructor(value: Try<T>, onChange?: () => void) {
    this.value = value;
    this.onChange = onChange;
    this.version = 0;
  }

  get() { return this.value.get(); }
  map<U>(f: (t: T) => U) { return new Map(this, f); }
  flatMap<U>(f: (t: T) => Signal<U>) { return new FlatMap(this, f); }

  value: Try<T>;
  version: number;
  onChange?: () => void;
  // don't need to track `level` because `update` is a no-op
  get level(): 0 { return 0; }
  reconcile(trace: Trace, level: number) { }

  set(t: Try<T>) {
    if (equal(t, this.value)) return;
    this.value = t;
    this.version++;
    if (this.onChange) this.onChange();
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
  reconcile(trace: Trace, level: number) {
    if (this.level === level) return;
    this.level = level;
    this.s.reconcile(trace, level);
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
  reconcile(trace: Trace, level: number) {
    if (this.level === level) return;
    this.level = level;
    this.s.reconcile(trace, level);
    if (this.sVersion === this.s.version) return;
    this.sVersion = this.s.version;
    let value: Try<U>;
    if (this.s.value.type === 'ok') {
      const fs = this.f(this.s.value.ok);
      fs.reconcile(trace, level);
      value = fs.value;
    } else {
      value = <Try<U>><unknown>this.s.value;
    }
    if (equal(value, this.value)) return;
    this.value = value;
    this.version++;
  }
}

class Join<T> implements Signal<T[]> {
  signals: Signal<T>[];
  versions: number[];

  constructor(
    signals: Signal<T>[]
  ) {
    this.version = 0;
    this.signals = signals;
    this.versions = signals.map(s => s.version);
    this.value = Try.join(...signals.map(s => s.value));
    this.level = Math.min(...signals.map(s => s.level));
  }

  get() { return this.value.get(); }
  map<V>(f: (t: T[]) => V) { return new Map(this, f); }
  flatMap<V>(f: (t: T[]) => Signal<V>) { return new FlatMap(this, f); }

  value: Try<T[]>;
  version: number;
  level: number;
  reconcile(trace: Trace, level: number) {
    if (this.level === level) return;
    this.level = level;
    const versions = this.signals.map(s => {
      s.reconcile(trace, level);
      return s.version;
    });
    if (equal(versions, this.versions))
      return;
    this.versions = versions;
    const value = Try.join(...this.signals.map(s => s.value));
    if (equal(value, this.value)) return;
    this.value = value;
    this.version++;
  }
}

class Label<T> implements Signal<T> {
  constructor(label: string, s: Signal<T>) {
    this.label = label;
    this.s = s;
  }

  get() { return this.s.get(); }
  map<U>(f: (t: T) => U) { return new Map(this, f); }
  flatMap<U>(f: (t: T) => Signal<U>) { return new FlatMap(this, f); }

  label: string;
  s: Signal<T>;
  get value() { return this.s.value; }
  get version() { return this.s.version; }
  // don't need to track `level` because `update` is a no-op
  get level() { return this.s.level; }
  reconcile(trace: Trace, level: number) {
    trace.open(this.label);
    this.s.reconcile(trace, level);
    trace.close();
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

  export type Cell<T> = CellIntf<T>;

  export function cell<T>(t: Try<T>, onChange?: () => void): Cell<T> {
    return new CellImpl(t, onChange);
  }

  export function cellOk<T>(t: T, onChange?: () => void): Cell<T> {
    return cell(Try.ok(t), onChange);
  }

  export function cellErr<T>(err: Error, onChange: () => void): Cell<T> {
    return cell<T>(Try.err(err), onChange);
  }

  export function join<T1, T2>(
    s1: Signal<T1>,
    s2: Signal<T2>
  ): Signal<[T1, T2]>
  export function join<T>(
    ...signals: Signal<T>[]
  ): Signal<T[]>
  export function join<T>(
    ...signals: Signal<T>[]
  ): Signal<T[]> {
    return new Join(signals);
  }

  export function joinObject<T>(
    obj: { [s: string]: Signal<T> }
  ): Signal<{ [s: string]: T }> {
    const keys = Object.keys(obj);
    const signals = Object.values(obj);
    return join(...signals).map(values =>
      keys.reduce<{ [s: string]: T }>(
        (obj, key, i) =>
          Object.assign({}, obj, { [key]: values[i] }),
        { }
      )
    );
  }

  export function label<T>(label: string, s: Signal<T>): Signal<T> {
    return new Label(label, s);
  }
}

export default Signal;
