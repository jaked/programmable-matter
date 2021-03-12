import * as Immutable from 'immutable';

import 'regenerator-runtime/runtime'; // required for react-inspector
import { Inspector } from 'react-inspector';

import { TwitterTweetEmbed } from 'react-twitter-embed';
import YouTube from 'react-youtube';
import { VictoryBar, VictoryChart } from 'victory';
import ReactTable from 'react-table';
import Gist from 'react-gist';
import { InlineMath, BlockMath } from 'react-katex';

import HighlightedCode from '../HighlightedCode';

import Signal from '../../util/Signal';
import { Env } from './index';

// TODO(jaked) clean these up somewhere
const now = Signal.cellOk(Date.now());
setInterval(() => { now.setOk(Date.now()) }, 100);

// updated by onmousemove handler in DisplayPane
// TODO(jaked) should go elsewhere
export const mouse = Signal.cellOk({ clientX: 0, clientY: 0 });

export function initValueEnv(
  setSelected: (note: string) => void,
): Env {
  return Immutable.Map({
    Inspector: Inspector,
    Tweet: TwitterTweetEmbed,
    YouTube: YouTube,
    VictoryBar: VictoryBar,
    VictoryChart: VictoryChart,
    InlineMath: InlineMath,
    BlockMath: BlockMath,
    Table: ReactTable,
    Gist: Gist,
    HighlightedCode: HighlightedCode,

    parseInt: (s: string) => parseInt(s),

    undefined: undefined,
    console: console,
  }).map(Signal.ok).concat(Immutable.Map({
    now,
    mouse,
  }));
}
