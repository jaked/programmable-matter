import * as Immutable from 'https://cdn.skypack.dev/pin/immutable@v4.0.0-rc.12-1NYCIz6xXwS40fslTFes/mode=imports/optimized/immutable.js';
// TODO(jaked) this must exist already
// TODO(jaked) is there a way to get Scala-ish Try(() => ...) ?
class Ok {
    constructor(ok) {
        this.type = 'ok';
        this.ok = ok;
    }
    get() { return this.ok; }
    map(f) { return Try.apply(() => f(this.ok)); }
    flatMap(f) {
        const tt = Try.apply(() => f(this.ok));
        if (tt.type === 'ok')
            return tt.ok;
        else
            return tt;
    }
    forEach(f) { return f(this.ok); }
    equals(other) {
        return (this === other ||
            other instanceof Ok && Immutable.is(this.ok, other.ok));
    }
    hashCode() {
        return Immutable.hash(this.ok);
    }
}
class Err {
    constructor(err) {
        this.type = 'err';
        this.err = err;
    }
    get() {
        const err = new Error(this.err.message);
        err.stack = `${err.stack}\n${this.err.stack}`;
        throw err;
    }
    map(f) { return this; }
    flatMap(f) { return this; }
    forEach(f) { }
    equals(other) {
        return (this === other ||
            other instanceof Err && Immutable.is(this.err, other.err));
    }
    hashCode() {
        return Immutable.hash(this.err);
    }
}
var Try;
(function (Try) {
    function ok(ok) { return new Ok(ok); }
    Try.ok = ok;
    function err(err) { return new Err(err); }
    Try.err = err;
    function apply(f) {
        try {
            return ok(f());
        }
        catch (e) {
            return err(e);
        }
    }
    Try.apply = apply;
    function join(...trys) {
        const values = [];
        for (let i = 0; i < trys.length; i++) {
            const trysi = trys[i]; // necessary for narrowing?
            if (trysi.type === 'ok')
                values.push(trysi.ok);
            else
                return trysi;
        }
        return Try.ok(values);
    }
    Try.join = join;
    function joinImmutableMap(tryMap) {
        const map = Immutable.Map().asMutable();
        let err = undefined;
        tryMap.forEach((t, k) => {
            if (t.type === 'ok') {
                map.set(k, t.ok);
            }
            else {
                err = t;
                return false;
            }
        });
        if (err)
            return err;
        else
            return Try.ok(map.asImmutable());
    }
    Try.joinImmutableMap = joinImmutableMap;
    function joinMap(tryMap) {
        const map = new Map();
        let err = undefined;
        tryMap.forEach((t, k) => {
            if (t.type === 'ok') {
                map.set(k, t.ok);
            }
            else {
                err = t;
                return false;
            }
        });
        if (err)
            return err;
        else
            return Try.ok(map);
    }
    Try.joinMap = joinMap;
})(Try || (Try = {}));
export default Try;
