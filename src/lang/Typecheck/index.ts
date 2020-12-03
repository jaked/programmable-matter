import * as Env from './env';
import * as Synth from './synth';
import * as Check from './check';

module Typecheck {
  export type Env = Env.Env;
  export const env = Env.env;
  export const synth = Synth.synth;
  export const synthMdx = Synth.synthMdx;
  export const extendEnvWithImport = Synth.extendEnvWithImport;
  export const extendEnvWithNamedExport = Synth.extendEnvWithNamedExport;
  export const extendEnvWithDefaultExport = Synth.extendEnvWithDefaultExport;
  export const check = Check.check;
}

export default Typecheck
