import Try from '../util/Try';
import Type from '../type';

type Interface = Try<{
  readonly type: Type,
  readonly dynamic: boolean,
  readonly mutable?: 'Code' | 'Session'
}>;
module Interface {
  export const type = (intf: Interface) =>
    intf.type === 'ok' ? intf.ok.type : Type.error(intf.err);

  export const dynamic = (intf: Interface) =>
    intf.type === 'ok' ? intf.ok.dynamic : false;

  export const undefined = Try.ok({ type: Type.undefined, dynamic: false });
}
export default Interface;
