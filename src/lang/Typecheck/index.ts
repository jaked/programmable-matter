import * as Types from './types';
import * as Synth from './synth';
import * as Check from './check';

module Typecheck {
  export type Env = Types.Env;
  export const synth = Synth.synth;
  export const synthProgram = Synth.synthProgram;
  export const synthMdx = Synth.synthMdx;
  export const check = Check.check;
}

export default Typecheck
