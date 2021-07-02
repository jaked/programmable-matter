import * as Immer from 'https://cdn.skypack.dev/pin/immer@v5.3.6-iPP5AcC6pvtKKfCCukkz/mode=imports/optimized/immer.js';
import React from 'https://cdn.skypack.dev/pin/react@v17.0.1-yH0aYV1FOvoIPeKBbHxg/mode=imports/optimized/react.js';
import ReactDOM from 'https://cdn.skypack.dev/pin/react-dom@v17.0.1-N7YTiyGWtBI97HFLtv0f/mode=imports/optimized/react-dom.js';
import Try from './Try.js';
const unreconciled = Try.err(new Error('unreconciled'));
function equal(v1, v2) {
  return v1 === v2;
}
function impl(s) {
    if (!(s instanceof SignalImpl))
        throw new Error(`expected SignalImpl`);
    return s;
}
class SignalImpl {
    constructor() {
        this.isDirty = true;
        this.deps = [];
    }
    dirty(value) {
        this.isDirty = true;
        const deps = [...this.deps];
        this.deps = [];
        for (let i = 0; i < deps.length; i++) {
            const s = deps[i];
            if (s)
                s.dirty();
        }
    }
    depend(s) {
        for (let i = 0; i < this.deps.length; i++)
            if (this.deps[i] === s)
                return;
        this.deps.push(s);
    }
    undepend(s) {
        for (let i = 0; i < this.deps.length; i++)
            if (this.deps[i] === s)
                this.deps[i] === undefined;
    }
    map(f) { return new MapImpl(this, f); }
    flatMap(f) { return new FlatMap(this, f); }
    liftToTry() { return new LiftToTry(this); }
}
class WritableImpl extends SignalImpl {
    setOk(t) { this.set(Try.ok(t)); }
    setErr(err) { this.set(Try.err(err)); }
    update(fn) { this.setOk(fn(this.get())); }
    produce(fn) { this.setOk(Immer.produce(this.get(), fn)); }
    mapWritable(f, fInv) { return new MapWritable(this, f, fInv); }
}
class Const extends SignalImpl {
    // TODO(jaked)
    // no-op deps to avoid needlessly holding refs
    constructor(value) {
        super();
        this.value = value;
    }
    get() { return this.value.get(); }
    get version() { return 1; }
    reconcile() { }
}
class CellImpl extends WritableImpl {
    constructor(value) {
        super();
        this.value = value;
        this.version = 1;
    }
    get() { return this.value.get(); }
    reconcile() { }
    set(t) {
        if (equal(t, this.value))
            return;
        this.value = t;
        this.version++;
        ReactDOM.unstable_batchedUpdates(() => {
            this.dirty(t);
        });
    }
    dirty(value) {
        const deps = [...this.deps];
        this.deps = [];
        for (let i = 0; i < deps.length; i++) {
            const s = deps[i];
            if (s)
                s.dirty(value);
        }
    }
}
class RefImpl extends SignalImpl {
    constructor() {
        super(...arguments);
        this.s = undefined;
    }
    set(s) {
        if (this.s)
            throw new Error('Signal.ref already set');
        this.s = s;
    }
    checkedS() {
        if (!this.s)
            throw new Error('Signal.ref not set');
        else
            return this.s;
    }
    get() { this.reconcile(); return this.checkedS().get(); }
    get value() { return this.checkedS().value; }
    get version() { return this.checkedS().version; }
    reconcile() { this.checkedS().reconcile(); }
    dirty(value) { impl(this.checkedS()).dirty(value); }
    depend(s) {
        impl(this.checkedS()).depend(s);
    }
    undepend(s) {
        impl(this.checkedS()).undepend(s);
    }
}
class MapImpl extends SignalImpl {
    constructor(s, f) {
        super();
        this.value = unreconciled;
        this.version = 0;
        this.sVersion = 0;
        this.s = s;
        this.f = f;
    }
    get() { this.reconcile(); return this.value.get(); }
    reconcile() {
        if (!this.isDirty)
            return;
        this.isDirty = false;
        impl(this.s).depend(this);
        this.s.reconcile();
        if (this.sVersion === this.s.version)
            return;
        this.sVersion = this.s.version;
        const value = this.s.value.map(this.f);
        if (equal(value, this.value))
            return;
        this.value = value;
        this.version++;
    }
}
class MapWritable extends WritableImpl {
    constructor(s, f, fInv) {
        super();
        this.value = unreconciled;
        this.version = 0;
        this.sVersion = 0;
        this.s = s;
        this.f = f;
        this.fInv = fInv;
    }
    get() { this.reconcile(); return this.value.get(); }
    reconcile() {
        if (!this.isDirty)
            return;
        this.isDirty = false;
        impl(this.s).depend(this);
        this.s.reconcile();
        if (this.sVersion === this.s.version)
            return;
        this.sVersion = this.s.version;
        const value = this.s.value.map(this.f);
        if (equal(value, this.value))
            return;
        this.value = value;
        this.version++;
    }
    set(u) {
        if (equal(u, this.value))
            return;
        if (u.type === 'ok') {
            const t = Try.apply(() => this.fInv(u.ok));
            this.s.set(t);
        }
        else {
            this.s.set(u);
        }
        // avoid recomputing `f` just to get the value we already have
        this.sVersion = this.s.version;
        this.value = u;
        this.version++;
    }
}
class FlatMap extends SignalImpl {
    constructor(s, f) {
        super();
        this.value = unreconciled;
        this.version = 0;
        this.sVersion = 0;
        this.s = s;
        this.f = f;
    }
    get() { this.reconcile(); return this.value.get(); }
    reconcile() {
        if (!this.isDirty)
            return;
        this.isDirty = false;
        impl(this.s).depend(this);
        this.s.reconcile();
        let value;
        if (this.sVersion === this.s.version) {
            if (!this.fs)
                return;
            impl(this.fs).depend(this);
            this.fs.reconcile();
            if (this.fs.version === this.fsVersion)
                return;
            this.fsVersion = this.fs.version;
            value = this.fs.value;
        }
        else {
            this.sVersion = this.s.version;
            if (this.s.value.type === 'ok') {
                try {
                    this.fs = this.f(this.s.value.ok);
                }
                catch (e) {
                    this.fs = Signal.err(e);
                }
                impl(this.fs).depend(this);
                this.fs.reconcile();
                this.fsVersion = this.fs.version;
                value = this.fs.value;
            }
            else {
                this.fs = undefined;
                this.fsVersion = undefined;
                value = this.s.value;
            }
        }
        if (equal(value, this.value))
            return;
        this.value = value;
        this.version++;
    }
}
class LiftToTry extends SignalImpl {
    constructor(s) {
        super();
        this.s = s;
    }
    get() { this.reconcile(); return this.s.value; }
    get value() { return Try.ok(this.s.value); }
    get version() { return this.s.version; }
    reconcile() {
        this.s.reconcile();
    }
    dirty() { impl(this.s).dirty(); }
    depend(s) {
        impl(this.s).depend(s);
    }
    undepend(s) {
        impl(this.s).undepend(s);
    }
}
class Join extends SignalImpl {
    constructor(signals) {
        super();
        this.value = unreconciled;
        this.version = 0;
        this.signals = signals;
        this.versions = signals.map(s => 0);
    }
    get() { this.reconcile(); return this.value.get(); }
    reconcile() {
        if (!this.isDirty)
            return;
        this.isDirty = false;
        const versions = this.signals.map(s => {
            impl(s).depend(this);
            s.reconcile();
            return s.version;
        });
        // equal() here is very slow :(
        let eqVersions = true;
        for (let i = 0; eqVersions && i < versions.length; i++)
            if (versions[i] !== this.versions[i])
                eqVersions = false;
        if (eqVersions)
            return;
        this.versions = versions;
        this.value = Try.join(...this.signals.map(s => s.value));
        this.version++;
    }
}
class Label extends SignalImpl {
    constructor(label, s) {
        super();
        this.label = label;
        this.s = s;
    }
    get() { this.reconcile(); return this.s.get(); }
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
        }
        catch (e) {
            const err = new Error(this.label);
            err.stack = `${err.stack}\n${e.stack}`;
            throw err;
        }
        if (typeof performance !== 'undefined') {
            const measureLabel = this.label +
                (isDirty ? ' (isDirty)' : '') +
                (version !== this.s.version ? ' (changed)' : '');
            try {
                performance.measure(measureLabel, this.label);
            }
            catch (e) {
                // TODO(jaked) we blow up if the same label appears twice in a call stack
            }
            performance.clearMarks(this.label);
            performance.clearMeasures(measureLabel);
        }
    }
    dirty(value) { impl(this.s).dirty(value); }
    depend(s) {
        impl(this.s).depend(s);
    }
    undepend(s) {
        impl(this.s).undepend(s);
    }
}
var Signal;
(function (Signal) {
    function constant(t) {
        return new Const(t);
    }
    Signal.constant = constant;
    function ok(t) {
        return constant(Try.ok(t));
    }
    Signal.ok = ok;
    function err(err) {
        return constant(Try.err(err));
    }
    Signal.err = err;
    function cell(t) {
        return new CellImpl(t);
    }
    Signal.cell = cell;
    function cellOk(t) {
        return cell(Try.ok(t));
    }
    Signal.cellOk = cellOk;
    function cellErr(err) {
        return cell(Try.err(err));
    }
    Signal.cellErr = cellErr;
    function ref() {
        return new RefImpl();
    }
    Signal.ref = ref;
    function mapWithPrev(s, f, initT, initU) {
        let currT = initT;
        let currU = initU;
        return s.map(t => {
            currU = f(t, currT, currU);
            currT = t;
            return currU;
        });
    }
    Signal.mapWithPrev = mapWithPrev;
    function join(...signals) {
        if (signals.length > 0)
            return new Join(signals);
        else
            return Signal.ok([]);
    }
    Signal.join = join;
    function joinObject(obj) {
        const keys = Object.keys(obj);
        const signals = Object.values(obj);
        return join(...signals).map(values => keys.reduce((obj, key, i) => Object.assign({}, obj, { [key]: values[i] }), {}));
    }
    Signal.joinObject = joinObject;
    function label(label, s) {
        return new Label(label, s);
    }
    Signal.label = label;

    const SignalComponent = ({ signal }) => {
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
            return signal.value.ok;
          } else {
            console.log(signal.value.err);
            return React.createElement('pre', {}, signal.value.err);
          }
        },
        [ signal, signal.version ]
      );
    }
    Signal.node = (signal) => React.createElement(SignalComponent, { signal });
    function useSignal(signal) {
        const [_, update] = React.useState({});
        const d = React.useMemo(() => ({ dirty: () => update({}) }), [update]);
        signal.depend(d);
        React.useEffect(() => {
            return () => signal.undepend(d);
        }, [signal, d]);
        return signal.get();
    }
    Signal.useSignal = useSignal;
})(Signal || (Signal = {}));
export default Signal;
