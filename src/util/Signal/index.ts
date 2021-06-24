import * as Immutable from 'immutable';
import * as Immer from 'immer';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Try from '../Try';
import { diffMap as diffImmutableMap } from '../immutable/Map';
import { diffMap } from '../diffMap';
import * as MapFuncs from '../MapFuncs';
import { bug } from '../bug';

const unreconciled = Try.err(new Error('unreconciled'));

/**
 * Simple implementation of reactive values. Values of signals are
 * "reconciled" (brought up to date with respect to child signals)
 * by reevaluating a a tree of signals top-down.
 *
 * A newly-created signal is unreconciled; it must be reconciled in order
 * for its value to be valid.
 *
 * A signal has a value, and a "version". When reconciliation changes a
 * signal's value, the version is incremented. Signals track the
 * versions of their children, in order to determine if they need to be
 * recomputed.
 *
 * When `reconcile` is called on a signal, if it is not dirty
 * then nothing need be done, so signals reached by more than one
 * path from the root are reconciled only once. Otherwise, the signal's
 * children are reconciled and if any of their versions
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
  get(): T;

  map<U>(f: (t: T) => U): Signal<U>;
  flatMap<U>(f: (t: T) => Signal<U>): Signal<U>;
  liftToTry(): Signal<Try<T>>;

  /**
   * value of this signal
   */
  value: Try<T>;

  // TODO(jaked) how can we make these private to impl but still testable?

  /**
   * if `isDirty`, signal must be reconciled before `value` is valid
   */
  isDirty: boolean;

  /**
   * add a dependency on this signal.
   * when the signal is dirtied, `dirty` is called on dependencies and dependencies are removed.
   * dependencies should call `depend` again if they still depend on signal.
   */
  depend: (d: { dirty: (value?: Try<T>) => void }) => void

  /**
   * remove a dependency on this signal.
   */
  undepend: (d: { dirty: (value?: Try<T>) => void }) => void

   /**
   * if a reconciliation changes `value`, `version` is incremented.
   */
  version: number;

  /**
   * reconcile this signal, recomputing `value` as needed.
   */
  reconcile(): void;
}

function equal(v1: any, v2: any): boolean {
  return Immutable.is(v1, v2);
}

function impl<T>(s: Signal<T>): SignalImpl<T> {
  if (!(s instanceof SignalImpl))
    bug(`expected SignalImpl`);
  return s;
}

abstract class SignalImpl<T> implements Signal<T> {
  abstract get(): T;
  abstract value: Try<T>;
  abstract version: number;
  abstract reconcile(): void;

  public isDirty: boolean = true;
  protected deps: (undefined | { dirty: (value?: Try<T>) => void })[] = [];
  protected dirtyDeps(value?: Try<unknown>) {
    const deps = [...this.deps];
    this.deps = [];
    for (let i=0; i < deps.length; i++) {
      const s = deps[i];
      if (s) s.dirty(value as Try<T>);
    }
  }
  public dirty(value?: Try<unknown>) {
    this.isDirty = true;
    this.dirtyDeps();
  }
  public depend(s: { dirty: (value?: Try<T>) => void }) {
    for (let i=0; i < this.deps.length; i++)
      if (this.deps[i] === s) return;
    this.deps.push(s);
  }
  public undepend(s: { dirty: (value?: Try<T>) => void }) {
    for (let i=0; i < this.deps.length; i++)
      if (this.deps[i] === s) this.deps[i] = undefined;
  }

  map<U>(f: (t: T) => U): Signal<U> { return new MapImpl(this, f); }
  flatMap<U>(f: (t: T) => Signal<U>): Signal<U> { return new FlatMap(this, f); }
  liftToTry(): Signal<Try<T>> { return new LiftToTry(this); }
}

interface WritableIntf<T> extends Signal<T> {
  set(t: Try<T>): void;
  setOk(t: T): void;
  setErr(err: Error): void;
  update(fn: (t: T) => T): void;
  produce(fn: (t: T) => void): void;

  mapInvertible<U>(f: (t: T) => U, fInv: (u: U) => T, eager?: boolean): WritableIntf<U>;
  mapProjection<U>(f: (t: T) => U, fSet: (t: T, u: U) => void): WritableIntf<U>;
}

abstract class WritableImpl<T> extends SignalImpl<T> {
  abstract set(t: Try<T>): void;
  setOk(t: T) { this.set(Try.ok(t)); }
  setErr(err: Error) { this.set(Try.err(err)); }
  // TODO(jaked) handle errors from fn
  update(fn: (t: T) => T) { this.setOk(fn(this.get())); }
  produce(fn: (t: T) => void) { this.setOk(Immer.produce(this.get(), fn)); }
  mapInvertible<U>(f: (t: T) => U, fInv: (u: U) => T, eager: boolean = false): WritableIntf<U> { return new MapInvertible(this, f, fInv, eager); }
  mapProjection<U>(f: (t: T) => U, fSet: (t: T, u: U) => void): WritableIntf<U> { return new MapProjection(this, f, fSet); }
}

class Const<T> extends SignalImpl<T> {
  // TODO(jaked)
  // no-op deps to avoid needlessly holding refs

  constructor(value: Try<T>) {
    super();
    this.value = value;
  }

  get() { return this.value.get(); }

  value: Try<T>;
  get version(): 1 { return 1; }
  reconcile() { }
}

class CellImpl<T> extends WritableImpl<T> {
  constructor(value: Try<T>) {
    super();
    this.value = value;
    this.version = 1;
    this.isDirty = false;
  }

  get() { return this.value.get(); }

  value: Try<T>;
  version: number;
  reconcile() { }

  set(t: Try<T>) {
    if (equal(t, this.value)) return;
    this.value = t;
    this.version++;
    ReactDOM.unstable_batchedUpdates(() => {
      this.dirtyDeps(t);
    });
  }
}

interface RefIntf<T> extends Signal<T> {
  set(s: Signal<T>): void;
}

class RefImpl<T> extends SignalImpl<T> implements RefIntf<T> {
  s: Signal<T> | undefined = undefined;

  set(s: Signal<T>) {
    if (this.s) throw new Error('Signal.ref already set');
    this.s = s;
  }

  checkedS() {
    if (!this.s) throw new Error('Signal.ref not set');
    else return this.s;
  }

  get() { this.reconcile(); return this.checkedS().get(); }

  get value() { return this.checkedS().value; }
  get version() { return this.checkedS().version; }
  reconcile() { this.checkedS().reconcile(); }
  dirty(value?: Try<T>) { impl(this.checkedS()).dirty(value); }
  depend(s: { dirty: (value?: Try<T>) => void }) {
    impl(this.checkedS()).depend(s);
  }
  undepend(s: { dirty: (value?: Try<T>) => void }) {
    impl(this.checkedS()).undepend(s);
  }
}

class MapImpl<T, U> extends SignalImpl<U> {
  s: Signal<T>;
  sVersion: number;
  f: (t: T) => U;

  constructor(s: Signal<T>, f: (t: T) => U) {
    super();
    this.value = unreconciled;
    this.version = 0;
    this.sVersion = 0;
    this.s = s;
    this.f = f;
  }

  get() { this.reconcile(); return this.value.get(); }

  value: Try<U>;
  version: number;
  reconcile() {
    if (!this.isDirty) return;
    this.isDirty = false;
    impl(this.s).depend(this);
    this.s.reconcile();
    if (this.sVersion === this.s.version) return;
    this.sVersion = this.s.version;
    const value = this.s.value.map(this.f);
    if (equal(value, this.value)) return;
    this.value = value;
    this.version++;
  }
}

class MapInvertible<T, U> extends WritableImpl<U> {
  s: WritableIntf<T>;
  sVersion: number;
  f: (t: T) => U;
  fInv: (u: U) => T;
  eager: boolean;

  constructor(
    s: WritableIntf<T>,
    f: (t: T) => U,
    fInv: (u: U) => T,
    eager: boolean = false
  ) {
    super();
    this.value = unreconciled;
    this.version = 0;
    this.sVersion = 0;
    this.s = s;
    this.f = f;
    this.fInv = fInv;
    this.eager = eager;
  }

  get() { this.reconcile(); return this.value.get(); }

  value: Try<U>;
  version: number;
  reconcile() {
    if (!this.isDirty) return;
    this.isDirty = false;
    impl(this.s).depend(this);
    this.s.reconcile();
    if (this.sVersion === this.s.version) return;
    this.sVersion = this.s.version;
    const value = this.s.value.map(this.f);
    if (equal(value, this.value)) return;
    this.value = value;
    this.version++;
  }

  set(u: Try<U>) {
    if (equal(u, this.value)) return;
    impl(this.s).undepend(this);
    if (u.type === 'ok') {
      const t = Try.apply(() => this.fInv(u.ok));
      this.s.set(t);
    } else {
      this.s.set(u as unknown as Try<T>);
    }
    impl(this.s).depend(this);
    // avoid recomputing `f` just to get the value we already have
    this.sVersion = this.s.version;
    this.value = u;
    this.version++;
    ReactDOM.unstable_batchedUpdates(() => {
      this.dirtyDeps(u);
    });
  }

  public dirty(value?: Try<unknown>) {
    this.isDirty = true;
    let u: undefined | Try<U> = undefined;
    if (this.eager && value && value.type == 'ok') {
      u = Try.apply(() => this.f(value.ok as T));
    }
    this.dirtyDeps(u);
  }
}

class MapProjection<T, U> extends WritableImpl<U> {
  s: WritableIntf<T>;
  sVersion: number;
  f: (t: T) => U;
  fSet: (t: T, u: U) => void;

  constructor(s: WritableIntf<T>, f: (t: T) => U, fSet: (t: T, u: U) => void) {
    super();
    this.value = unreconciled;
    this.version = 0;
    this.sVersion = 0;
    this.s = s;
    this.f = f;
    this.fSet = fSet;
  }

  get() { this.reconcile(); return this.value.get(); }

  value: Try<U>;
  version: number;
  reconcile() {
    if (!this.isDirty) return;
    this.isDirty = false;
    impl(this.s).depend(this);
    this.s.reconcile();
    if (this.sVersion === this.s.version) return;
    this.sVersion = this.s.version;
    const value = this.s.value.map(this.f);
    if (equal(value, this.value)) return;
    this.value = value;
    this.version++;
  }

  set(u: Try<U>) {
    if (equal(u, this.value)) return;
    impl(this.s).undepend(this);
    if (u.type === 'ok') {
      this.s.produce(t => { this.fSet(t, u.ok) });
    } else {
      this.s.set(u as unknown as Try<T>);
    }
    impl(this.s).depend(this);
    // avoid recomputing `f` just to get the value we already have
    this.sVersion = this.s.version;
    this.value = u;
    this.version++;
    ReactDOM.unstable_batchedUpdates(() => {
      this.dirtyDeps(u);
    });
  }

  produce(fn: (u: U) => void) {
    this.s.produce(t => fn(this.f(t)));
  }
}

class FlatMap<T, U> extends SignalImpl<U> {
  s: Signal<T>;
  sVersion: number;
  fs: Signal<U> | undefined;
  fsVersion: number | undefined;
  f: (t: T) => Signal<U>;

  constructor(s: Signal<T>, f: (t: T) => Signal<U>) {
    super();
    this.value = unreconciled;
    this.version = 0;
    this.sVersion = 0;
    this.s = s;
    this.f = f;
  }

  get() { this.reconcile(); return this.value.get(); }

  value: Try<U>;
  version: number;
  reconcile() {
    if (!this.isDirty) return;
    this.isDirty = false;
    impl(this.s).depend(this);
    this.s.reconcile();
    let value: Try<U>;
    if (this.sVersion === this.s.version) {
      if (!this.fs) return;
      impl(this.fs).depend(this);
      this.fs.reconcile();
      if (this.fs.version === this.fsVersion) return;
      this.fsVersion = this.fs.version;
      value = this.fs.value;
    } else {
      this.sVersion = this.s.version;
      if (this.s.value.type === 'ok') {
        try {
          this.fs = this.f(this.s.value.ok);
        } catch (e) {
          this.fs = Signal.err(e);
        }
        impl(this.fs).depend(this);
        this.fs.reconcile();
        this.fsVersion = this.fs.version;
        value = this.fs.value;
      } else {
        this.fs = undefined;
        this.fsVersion = undefined;
        value = <Try<U>><unknown>this.s.value;
      }
    }
    if (equal(value, this.value)) return;
    this.value = value;
    this.version++;
  }
}

class LiftToTry<T> extends SignalImpl<Try<T>> {
  s: Signal<T>;

  constructor(s: Signal<T>) {
    super();
    this.s = s;
  }

  get() { this.reconcile(); return this.s.value; }

  get value(): Try<Try<T>> { return Try.ok(this.s.value); }
  get version(): number { return this.s.version; }
  reconcile() {
    this.s.reconcile();
  }
  dirty() { impl(this.s).dirty(); }
  depend(s: { dirty: () => void }) {
    impl(this.s).depend(s);
  }
  undepend(s: { dirty: () => void }) {
    impl(this.s).undepend(s);
  }
}

class Join<T> extends SignalImpl<T[]> {
  signals: Signal<T>[];
  versions: number[];

  constructor(
    signals: Signal<T>[]
  ) {
    super();
    this.value = unreconciled;
    this.version = 0;
    this.signals = signals;
    this.versions = signals.map(s => 0);
  }

  get() { this.reconcile(); return this.value.get(); }

  value: Try<T[]>;
  version: number;
  reconcile() {
    if (!this.isDirty) return;
    this.isDirty = false;
    const versions = this.signals.map(s => {
      impl(s).depend(this);
      s.reconcile();
      return s.version;
    });
    // equal() here is very slow :(
    let eqVersions = true;
    for (let i=0; eqVersions && i < versions.length; i++)
      if (versions[i] !== this.versions[i]) eqVersions = false;
    if (eqVersions) return;
    this.versions = versions;
    this.value = Try.join(...this.signals.map(s => s.value));
    this.version++;
  }
}

class JoinImmutableMap<K, V> extends SignalImpl<Immutable.Map<K, V>> {
  s: Signal<Immutable.Map<K, Signal<V>>>;
  sVersion: number;
  vsSignals: Immutable.Map<K, Signal<V>>;
  vsVersions: Immutable.Map<K, number>;

  constructor(
    s: Signal<Immutable.Map<K, Signal<V>>>
  ) {
    super();
    this.value = unreconciled;
    this.version = 0;
    this.sVersion = 0;
    this.s = s;
    this.vsSignals = Immutable.Map();
    this.vsVersions = Immutable.Map();
  }

  get() { this.reconcile(); return this.value.get(); }

  value: Try<Immutable.Map<K, V>>;
  version: number;
  reconcile() {
    if (!this.isDirty) return;
    this.isDirty = false;
    impl(this.s).depend(this);
    this.s.reconcile();
    if (this.sVersion === this.s.version) {
      this.vsSignals.forEach((v, k) => {
        impl(v).depend(this);
        v.reconcile();
      });
      if (this.vsSignals.every((v, k) => {
        const vVersion = this.vsVersions.get(k);
        if (vVersion === undefined) bug(`expected vsVersion for ${k}`);
        return v.version === vVersion;
      })) return;

      // TODO(jaked)
      // incrementally update value / versions instead of rebuilding from scratch
      // since it is likely that only some values are updated
      this.vsVersions = this.vsSignals.map(v => v.version);
      this.value = Try.joinImmutableMap(this.vsSignals.map(s => s.value));
      this.version++;
    } else {
      this.sVersion = this.s.version
      if (this.s.value.type === 'ok') {
        this.vsSignals = this.s.value.ok;
        this.vsSignals.forEach(v => {
          impl(v).depend(this);
          v.reconcile()
        });

        // TODO(jaked)
        // incrementally update value / versions instead of rebuilding from scratch
        // since it is likely that only some values are updated
        this.vsVersions = this.vsSignals.map(v => v.version);
        this.value = Try.joinImmutableMap(this.vsSignals.map(s => s.value));
      } else {
        this.vsSignals = Immutable.Map();
        this.vsVersions = Immutable.Map();
        this.value = <Try<Immutable.Map<K, V>>><unknown>this.s.value;
      }
      this.version++;
    }
  }
}

class JoinMap<K, V> extends SignalImpl<Map<K, V>> {
  s: Signal<Map<K, Signal<V>>>;
  sVersion: number;
  vsSignals: Map<K, Signal<V>>;
  vsVersions: Map<K, number>;

  constructor(
    s: Signal<Map<K, Signal<V>>>
  ) {
    super();
    this.value = unreconciled;
    this.version = 0;
    this.sVersion = 0;
    this.s = s;
    this.vsSignals = new Map();
    this.vsVersions = new Map();
  }

  get() { this.reconcile(); return this.value.get(); }

  value: Try<Map<K, V>>;
  version: number;
  reconcile() {
    if (!this.isDirty) return;
    this.isDirty = false;
    impl(this.s).depend(this);
    this.s.reconcile();
    if (this.sVersion === this.s.version) {
      this.vsSignals.forEach((v, k) => {
        impl(v).depend(this);
        v.reconcile();
      });
      if (MapFuncs.every(this.vsSignals, (v, k) => {
        const vVersion = this.vsVersions.get(k);
        if (vVersion === undefined) bug(`expected vsVersion for ${k}`);
        return v.version === vVersion;
      })) return;

      // TODO(jaked)
      // incrementally update value / versions instead of rebuilding from scratch
      // since it is likely that only some values are updated
      this.vsVersions = MapFuncs.map(this.vsSignals, v => v.version);
      this.value = Try.joinMap(MapFuncs.map(this.vsSignals, s => s.value));
      this.version++;
    } else {
      this.sVersion = this.s.version
      if (this.s.value.type === 'ok') {
        this.vsSignals = this.s.value.ok;
        this.vsSignals.forEach(v => {
          impl(v).depend(this);
          v.reconcile()
        });

        // TODO(jaked)
        // incrementally update value / versions instead of rebuilding from scratch
        // since it is likely that only some values are updated
        this.vsVersions = MapFuncs.map(this.vsSignals, v => v.version);
        this.value = Try.joinMap(MapFuncs.map(this.vsSignals, s => s.value));
      } else {
        this.vsSignals = new Map();
        this.vsVersions = new Map();
        this.value = <Try<Map<K, V>>><unknown>this.s.value;
      }
      this.version++;
    }
  }
}

// specialized MapImpl that projects a key from a map
// and also does not depend on the map signal
// since this is handled specially in UnjoinMap
class UnjoinMapEntry<K,V> extends SignalImpl<V> {
  unjoin: UnjoinMap<K, V>;
  s: Signal<Map<K, V>>;
  sVersion: number;
  key: K;

  constructor(unjoin: UnjoinMap<K, V>, s: Signal<Map<K, V>>, key: K) {
    super();
    this.value = unreconciled;
    this.version = 0;
    this.sVersion = 0;
    this.s = s;
    this.key = key;
    this.unjoin = unjoin;
  }

  get() { this.reconcile(); return this.value.get(); }

  value: Try<V>;
  version: number;
  reconcile() {
    if (!this.isDirty) return;
    this.isDirty = false;
    // nobody reconciles the outer signal when values change but keys don't
    // so we need to re-add the dep when values change
    impl(this.s).depend(this.unjoin);
    this.s.reconcile();
    if (this.sVersion === this.s.version) return;
    this.sVersion = this.s.version;
    const value = this.s.value.map(m => {
      if (m.has(this.key)) {
        return m.get(this.key) ?? bug(`expected get`);
      } else {
        // deleting an entry causes the outer signal to fire
        // user code should drop any derivatives of deleted entries
        // but if it doesn't it can see this error
        throw new Error(`no entry for '${this.key}'`);
      }
    });
    if (equal(value, this.value)) return;
    this.value = value;
    this.version++;
  }
}

class UnjoinMap<K, V> extends SignalImpl<Map<K, Signal<V>>> {
  s: Signal<Map<K, V>>;
  sVersion: number;
  prevInput: Map<K, V>;
  prevOutput: Map<K, SignalImpl<V>>;

  constructor(
    s: Signal<Map<K, V>>
  ) {
    super();
    this.value = unreconciled;
    this.version = 0;
    this.sVersion = 0;
    this.s = s;
    this.prevInput = new Map();
    this.prevOutput = new Map();
  }

  get() { this.reconcile(); return this.value.get(); }

  value: Try<Map<K, Signal<V>>>;
  version: number;
  reconcile() {
    if (!this.isDirty) return;
    this.isDirty = false;
    impl(this.s).depend(this);
    this.s.reconcile();
    if (this.sVersion === this.s.version) return;
    this.sVersion = this.s.version;
    let value;
    if (this.s.value.type === 'err') {
      value = this.s.value as unknown as Try<Map<K, Signal<V>>>;
      // TODO(jaked) I think it's OK to hang onto prevInput / prevOutput here?
    } else {
      const input = this.s.value.ok;
      const output = Immer.produce(this.prevOutput, outputDraft => {
        const output = outputDraft as unknown as Map<K, SignalImpl<V>>; // TODO(jaked) ???

        const { added, deleted } = diffMap(this.prevInput, input);
        deleted.forEach(key => { output.delete(key) });
        added.forEach((v, key) => {
          output.set(key, new UnjoinMapEntry(this, this.s, key));
        });
      });
      this.prevInput = input;
      this.prevOutput = output;
      value = Try.ok(output);
    }
    if (value === this.value) return;
    this.value = value;
    this.version++;
  }

  public dirty(value?: Try<Map<K, V>>) {
    if (value && value.type === 'ok') {
      const { added, changed, deleted } = diffMap(this.prevInput, value.ok);
      if (added.size > 0 || deleted.size > 0)
        super.dirty();
      changed.forEach((_, key) => {
        const entry = this.prevOutput.get(key) ?? bug(`expected entry`);
        entry.dirty();
      });
    } else {
      super.dirty();
    }
  }
}

// specialized MapWritable that projects a key from a map
// and also does not depend on the map signal
// since this is handled specially in UnjoinMapWritable
class UnjoinMapWritableEntry<K,V> extends WritableImpl<V> {
  unjoin: UnjoinMapWritable<K, V>;
  s: Signal.Writable<Map<K, V>>;
  sVersion: number;
  key: K;

  constructor(unjoin: UnjoinMapWritable<K, V>, s: Signal.Writable<Map<K, V>>, key: K) {
    super();
    this.value = unreconciled;
    this.version = 0;
    this.sVersion = 0;
    this.s = s;
    this.key = key;
    this.unjoin = unjoin;
  }

  get() { this.reconcile(); return this.value.get(); }

  value: Try<V>;
  version: number;
  reconcile() {
    if (!this.isDirty) return;
    this.isDirty = false;
    // nobody reconciles the outer signal when values change but keys don't
    // so we need to re-add the dep when values change
    impl(this.s).depend(this.unjoin);
    this.s.reconcile();
    if (this.sVersion === this.s.version) return;
    this.sVersion = this.s.version;
    const value = this.s.value.map(m => {
      if (m.has(this.key)) {
        return m.get(this.key) ?? bug(`expected get`);
      } else {
        // deleting an entry causes the outer signal to fire
        // user code should drop any derivatives of deleted entries
        // but if it doesn't it can see this error
        throw new Error(`no entry for '${this.key}'`);
      }
    });
    if (equal(value, this.value)) return;
    this.value = value;
    this.version++;
  }

  set(v: Try<V>) {
    if (equal(v, this.value)) return;
    if (v.type === 'ok') {
      this.s.produce(map => { map.set(this.key, v.ok) });
    } else {
      // this is weird but makes sense as the inverse of joinMap I guess?
      this.s.setErr(v.err);
    }
    // don't bother optimizing like MapWritable, it's cheap to project the key
  }
}

class UnjoinMapWritable<K, V> extends SignalImpl<Map<K, Signal.Writable<V>>> {
  s: Signal.Writable<Map<K, V>>;
  sVersion: number;
  prevInput: Map<K, V>;
  prevOutput: Map<K, WritableImpl<V>>;

  constructor(
    s: Signal.Writable<Map<K, V>>
  ) {
    super();
    this.value = unreconciled;
    this.version = 0;
    this.sVersion = 0;
    this.s = s;
    this.prevInput = new Map();
    this.prevOutput = new Map();
  }

  get() { this.reconcile(); return this.value.get(); }

  value: Try<Map<K, Signal.Writable<V>>>;
  version: number;
  reconcile() {
    if (!this.isDirty) return;
    this.isDirty = false;
    impl(this.s).depend(this);
    this.s.reconcile();
    if (this.sVersion === this.s.version) return;
    this.sVersion = this.s.version;
    let value;
    if (this.s.value.type === 'err') {
      value = this.s.value as unknown as Try<Map<K, Signal<V>>>;
      // TODO(jaked) I think it's OK to hang onto prevInput / prevOutput here?
    } else {
      const input = this.s.value.ok;
      const output = Immer.produce(this.prevOutput, outputDraft => {
        const output = outputDraft as unknown as Map<K, WritableImpl<V>>; // TODO(jaked) ???

        const { added, deleted } = diffMap(this.prevInput, input);
        deleted.forEach(key => { output.delete(key) });
        added.forEach((v, key) => {
          output.set(key, new UnjoinMapWritableEntry(this, this.s, key));
        });
      });
      this.prevInput = input;
      this.prevOutput = output;
      value = Try.ok(output);
    }
    if (value === this.value) return;
    this.value = value;
    this.version++;
  }

  public dirty(value?: Try<Map<K, V>>) {
    if (value && value.type === 'ok') {
      const { added, changed, deleted } = diffMap(this.prevInput, value.ok);
      if (added.size > 0 || deleted.size > 0)
        super.dirty();
      changed.forEach((_, key) => {
        const entry = this.prevOutput.get(key) ?? bug(`expected entry`);
        entry.dirty();
      });
    } else {
      super.dirty();
    }
  }
}

class Label<T> extends SignalImpl<T> {
  constructor(label: string, s: Signal<T>) {
    super();
    this.label = label;
    this.s = s;
  }

  get() { this.reconcile(); return this.s.get(); }

  label: string;
  s: Signal<T>;
  get value() { return this.s.value; }
  get version() { return this.s.version; }
  reconcile() {
    const version = this.s.version;
    const isDirty = this.s.isDirty;
    if (typeof performance !== 'undefined') {
      performance.mark(this.label);
    }
    try {
      this.s.reconcile();
    } catch (e) {
      const err = new Error(this.label);
      err.stack = `${err.stack}\n${e.stack}`;
      throw err;
    }
    if (typeof performance !== 'undefined') {
      const measureLabel =
        this.label +
          (isDirty ? ' (isDirty)' : '') +
          (version !== this.s.version ? ' (changed)' : '');
      try {
        performance.measure(measureLabel, this.label);
      } catch (e) {
        // TODO(jaked) we blow up if the same label appears twice in a call stack
      }
      performance.clearMarks(this.label);
      performance.clearMeasures(measureLabel);
    }
  }
  dirty(value?: Try<T>) { impl(this.s).dirty(value); }
  depend(s: { dirty: (value?: Try<T>) => void }) {
    impl(this.s).depend(s);
  }
  undepend(s: { dirty: (value?: Try<T>) => void }) {
    impl(this.s).undepend(s);
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

  export type Writable<T> = WritableIntf<T>;

  export function cell<T>(t: Try<T>): Writable<T> {
    return new CellImpl(t);
  }

  export function cellOk<T>(t: T): Writable<T> {
    return cell(Try.ok(t));
  }

  export function cellErr<T>(err: Error): Writable<T> {
    return cell<T>(Try.err(err));
  }

  export type Ref<T> = RefIntf<T>;

  export function ref<T>(): Ref<T> {
    return new RefImpl();
  }

  export function mapWithPrev<T, U>(
    s: Signal<T>,
    f: (t: T, prevT: T, prevU: U) => U,
    initT: T,
    initU: U
  ): Signal<U> {
    let currT = initT;
    let currU = initU;
    return s.map(t => {
      currU = f(t, currT, currU);
      currT = t;
      return currU;
    });
  }

  export function mapInvertibleWithPrev<T, U>(
    s: Signal.Writable<T>,
    f: (t: T, prevT: T, prevU: U) => U,
    fInv: (u: U, prevU: U, prevT: T) => T,
    initT: T,
    initU: U,
    eager: boolean = false,
  ): Signal.Writable<U> {
    let currT = initT;
    let currU = initU;
    return s.mapInvertible(
      t => {
        currU = f(t, currT, currU);
        currT = t;
        return currU;
      },
      u => {
        currT = fInv(u, currU, currT);
        currU = u;
        return currT;
      },
      eager);
  }

  export function join<T1, T2>(
    s1: Signal<T1>,
    s2: Signal<T2>,
  ): Signal<[T1, T2]>
  export function join<T1, T2, T3>(
    s1: Signal<T1>,
    s2: Signal<T2>,
    s3: Signal<T3>,
  ): Signal<[T1, T2, T3]>
  export function join<T1, T2, T3, T4>(
    s1: Signal<T1>,
    s2: Signal<T2>,
    s3: Signal<T3>,
    s4: Signal<T4>,
  ): Signal<[T1, T2, T3, T4]>
  export function join<T1, T2, T3, T4, T5>(
    s1: Signal<T1>,
    s2: Signal<T2>,
    s3: Signal<T3>,
    s4: Signal<T4>,
    s5: Signal<T5>,
  ): Signal<[T1, T2, T3, T4, T5]>
  export function join<T1, T2, T3, T4, T5, T6>(
    s1: Signal<T1>,
    s2: Signal<T2>,
    s3: Signal<T3>,
    s4: Signal<T4>,
    s5: Signal<T5>,
    s6: Signal<T6>,
  ): Signal<[T1, T2, T3, T4, T5, T6]>
  export function join<T1, T2, T3, T4, T5, T6, T7>(
    s1: Signal<T1>,
    s2: Signal<T2>,
    s3: Signal<T3>,
    s4: Signal<T4>,
    s5: Signal<T5>,
    s6: Signal<T6>,
    s7: Signal<T7>,
  ): Signal<[T1, T2, T3, T4, T5, T6, T7]>
  export function join<T1, T2, T3, T4, T5, T6, T7, T8>(
    s1: Signal<T1>,
    s2: Signal<T2>,
    s3: Signal<T3>,
    s4: Signal<T4>,
    s5: Signal<T5>,
    s6: Signal<T6>,
    s7: Signal<T7>,
    s8: Signal<T8>,
  ): Signal<[T1, T2, T3, T4, T5, T6, T7, T8]>
  export function join<T1, T2, T3, T4, T5, T6, T7, T8, T9>(
    s1: Signal<T1>,
    s2: Signal<T2>,
    s3: Signal<T3>,
    s4: Signal<T4>,
    s5: Signal<T5>,
    s6: Signal<T6>,
    s7: Signal<T7>,
    s8: Signal<T8>,
    s9: Signal<T9>,
  ): Signal<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>
  export function join<T>(
    ...signals: Signal<T>[]
  ): Signal<T[]>
  export function join<T>(
    ...signals: Signal<T>[]
  ): Signal<T[]> {
    if (signals.length > 0)
      return new Join(signals);
    else
      return Signal.ok<T[]>([]);
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

  export function joinImmutableMap<K, V>(
    map: Signal<Immutable.Map<K, Signal<V>>>
  ): Signal<Immutable.Map<K, V>> {
    return new JoinImmutableMap(map);
  }

  export function joinMap<K, V>(
    map: Signal<Map<K, Signal<V>>>
  ): Signal<Map<K, V>> {
    return new JoinMap(map);
  }

  export function unjoinMap<K, V>(
    map: Signal<Map<K, V>>
  ): Signal<Map<K, Signal<V>>> {
    return new UnjoinMap(map);
  }

  export function unjoinMapWritable<K, V>(
    map: Signal.Writable<Map<K, V>>
  ): Signal<Map<K, Signal.Writable<V>>> {
    return new UnjoinMapWritable(map);
  }

  export function mapImmutableMap<K, V, U>(
    input: Signal<Immutable.Map<K, V>>,
    f: (v: V, k: K, coll: Immutable.Map<K, V>) => U
  ): Signal<Immutable.Map<K, U>> {
    return mapWithPrev<Immutable.Map<K, V>, Immutable.Map<K, U>>(
      input,
      (input, prevInput, prevOutput) =>
        prevOutput.withMutations(output => {
          const { added, changed, deleted } = diffImmutableMap(prevInput, input);
          deleted.forEach(key => { output = output.delete(key) });
          changed.forEach(([prev, curr], key) => { output = output.set(key, f(curr, key, input)) });
          added.forEach((v, key) => { output = output.set(key, f(v, key, input)) });
        }),
      Immutable.Map(),
      Immutable.Map(),
    )
  }

  export function mapMap<K, V, U>(
    input: Signal<Map<K, V>>,
    f: (v: V, k: K, coll: Map<K, V>) => U
  ): Signal<Map<K, U>> {
    return mapWithPrev<Map<K, V>, Map<K, U>>(
      input,
      (input, prevInput, prevOutput) =>
        Immer.produce(prevOutput, outputDraft => {
          const output = outputDraft as Map<K, U>; // TODO(jaked) ???

          const { added, changed, deleted } = diffMap(prevInput, input);
          deleted.forEach(key => { output.delete(key) });
          changed.forEach(([prev, curr], key) => { output.set(key, f(curr, key, input)) });
          added.forEach((v, key) => { output.set(key, f(v, key, input)) });
        }),
      new Map(),
      new Map(),
    )
  }

  export function filterMap<K, V>(
    input: Signal<Map<K, V>>,
    p: (v: V, k: K, coll: Map<K, V>) => boolean
  ): Signal<Map<K, V>> {
    return mapWithPrev<Map<K, V>, Map<K, V>>(
      input,
      (input, prevInput, prevOutput) =>
        Immer.produce(prevOutput, outputDraft => {
          const output = outputDraft as Map<K, V>;

          const { added, changed, deleted } = diffMap(prevInput, input);
          deleted.forEach(key => { output.delete(key) });
          changed.forEach(([prev, curr], key) => {
            output.delete(key);
            if (p(curr, key, input)) output.set(key, curr);
          });
          added.forEach((v, key) => {
            if (p(v, key, input)) output.set(key, v)
          });
      }),
      new Map(),
      new Map(),
    )
  }

  export function filterMapWritable<K, V>(
    input: Signal.Writable<Map<K, V>>,
    p: (v: V, k: K, coll: Map<K, V>) => boolean
  ): Signal.Writable<Map<K, V>> {
    return mapInvertibleWithPrev<Map<K, V>, Map<K, V>>(
      input,
      (input, prevInput, prevOutput) =>
        Immer.produce(prevOutput, outputDraft => {
          const output = outputDraft as Map<K, V>;

          const { added, changed, deleted } = diffMap(prevInput, input);
          deleted.forEach(key => { output.delete(key) });
          changed.forEach(([prev, curr], key) => {
            if (p(curr, key, input))
              output.set(key, curr);
            else
              output.delete(key);
          });
          added.forEach((v, key) => {
            if (p(v, key, input)) output.set(key, v)
          });
      }),
      (output, prevOutput, prevInput) =>
        Immer.produce(prevInput, inputDraft => {
          const input = inputDraft as Map<K, V>;

          const { added, changed, deleted } = diffMap(prevOutput, output);
          deleted.forEach(key => { input.delete(key) });
          changed.forEach(([prev, curr], key) => {
            if (p(curr, key, output))
              input.set(key, curr);
            else
              throw new Error(`value doesn't match predicate`);
          });
          added.forEach((v, key) => {
            if (p(v, key, output))
              input.set(key, v)
            else
              throw new Error(`value doesn't match predicate`);
          });
      }),
      new Map(),
      new Map(),
      true, // eager
    )
  }

  export function label<T>(label: string, s: Signal<T>): Signal<T> {
    return new Label(label, s);
  }

  const SignalComponent = ({ signal }: { signal: Signal<React.ReactNode> }) => {
    const [_, update] = React.useState({});
    const d = React.useMemo(() => ({ dirty: () => update({}) }), [update]);
    signal.depend(d);
    React.useEffect(() => {
      return () => signal.undepend(d);
    }, [signal, d]);
    signal.reconcile();
    // memoize on signal + version to prune render
    return React.useMemo(
      () => {
        if (signal.value.type === 'ok') {
          // TODO(jaked) ReactElement != ReactNode
          const value = signal.value.ok as any;
          // TODO(jaked) not sure where this should happen
          // Evaluate returns undefined for invalid code
          // but React wants null not undefined
          if (value === undefined) return null;
          else return value;
        } else {
          console.log(signal.value.err);
          return React.createElement('pre', {}, signal.value.err);
        }
      },
      [ signal, signal.version ]
    );
  }

  export const node = (signal: Signal<React.ReactNode>) =>
    React.createElement(SignalComponent, { signal })

  // inspired by Focal.lift

  export type LiftedProps<T> = {
    [K in keyof T]: T[K] | Signal<T[K]>
  }

  export function liftComponent<Props>(
    component: React.FunctionComponent<Props>
  ) {
    // TODO(jaked) fast path if no props / children are Signals?
    // TODO(jaked) tighten up types?

    return (props: LiftedProps<Props>) => {
      // memoize on props to avoid recreating on level changes
      const signal = React.useMemo(
        () =>
          Signal.joinObject(
            Object.keys(props).reduce<any>(
              (obj, key) => {
                const value = props[key];
                const signal = value instanceof SignalImpl ? value : Signal.ok(value);
                return { ...obj, [key]: signal }
              },
              {}
            )
          ),
        Object.values(props),
      );
      const [_, update] = React.useState({});
      const d = React.useMemo(() => ({ dirty: () => update({}) }), [update]);
      signal.depend(d);
      React.useEffect(() => {
        return () => signal.undepend(d);
      }, [signal, d]);
      signal.reconcile();
      // memoize on signal + version to prune render
      return React.useMemo(
        () => {
          if (signal.value.type === 'ok') {
            return React.createElement(component, signal.value.ok as any);
          } else {
            console.log(signal.value.err);
            return React.createElement('pre', {}, signal.value.err);
          }
        },
        [ signal, signal.version ]
      );
    }
  }

  export function liftRefForwardingComponent<Ref, Props>(
    component: React.RefForwardingComponent<Ref, Props>
  ) {
    // create once to avoid remounts
    const memoComponent = React.forwardRef(component);

    return React.forwardRef<Ref, LiftedProps<Props>>((props, ref) => {
      // memoize on props to avoid recreating on level changes
      const signal = React.useMemo(
        () => {
          return Signal.joinObject(
            Object.keys(props).reduce<any>(
              (obj, key) => {
                const value = props[key];
                const signal = value instanceof SignalImpl ? value : Signal.ok(value);
                return { ...obj, [key]: signal }
              },
              {}
            )
          )
        },
        Object.values(props),
      );
      const [_, update] = React.useState({});
      const d = React.useMemo(() => ({ dirty: () => update({}) }), [update]);
      signal.depend(d);
      React.useEffect(() => {
        return () => { signal.undepend(d) };
      }, [signal, d]);
      signal.reconcile();
      // memoize on signal + version to prune render
      return React.useMemo(
        () => {
          if (signal.value.type === 'ok') {
            return React.createElement(memoComponent, { ref, ...signal.value.ok as any });
          } else {
            console.log(signal.value.err);
            return React.createElement('pre', {}, signal.value.err);
          }
        },
        [ signal, signal.version ]
      );
    });
  }

  export function useSignal<T>(signal: Signal<T>): T {
    const [_, update] = React.useState({});
    const d = React.useMemo(() => ({ dirty: () => update({}) }), [update]);
    signal.depend(d);
    React.useEffect(() => {
      return () => signal.undepend(d);
    }, [signal, d]);
    return signal.get();
  }
}

export default Signal;
