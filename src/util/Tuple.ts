import Record from './Record';

export class Tuple2<T1, T2> extends Record<Tuple2<T1, T2>> {
  _1: T1 = undefined as unknown as T1;
  _2: T2 = undefined as unknown as T2;

  constructor(_1: T1, _2: T2) {
    super(
      arguments.length === 0 ? undefined :
      arguments.length === 1 && typeof _1 === 'symbol' ? (_1 as unknown as undefined) :
      { _1, _2 }
    );
  }
}
