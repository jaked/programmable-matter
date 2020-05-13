import * as Immutable from 'immutable';

type Tuple2Props<T1, T2> = { _1: T1, _2: T2 };
const Tuple2Record = Immutable.Record<Tuple2Props<any, any>>({ _1: undefined, _2: undefined });
export function Tuple2<T1, T2>(_1: T1, _2: T2): Immutable.RecordOf<{ _1: T1, _2: T2}> {
  return Tuple2Record({ _1, _2 });
}
export type Tuple2<T1, T2> = Immutable.RecordOf<Tuple2Props<T1, T2>>;
