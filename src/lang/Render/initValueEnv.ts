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
const now = Signal.cellOk(new Date());
setInterval(() => { now.setOk(new Date()) }, 100);

const mouse = Signal.cellOk({ clientX: 0, clientY: 0 });
document.addEventListener('mousemove', ({ clientX, clientY }) => {
  mouse.setOk({ clientX, clientY });
});

export function initValueEnv(
  setSelected: (note: string) => void,
): Env {
  return Immutable.Map({
    a: 'a',
    br: 'br',
    body: 'body',
    button: 'button',
    code: 'pre',
    div: 'div',
    ellipse: 'ellipse',
    footer: 'footer',
    h1: 'h1',
    head: 'head',
    header: 'header',
    hr: 'hr',
    html: 'html',
    img: 'img',
    inlineCode: 'code',
    input: 'input',
    label: 'label',
    li: 'li',
    p: 'p',
    section: 'section',
    span: 'span',
    strong: 'strong',
    style: 'style',
    sub: 'sub',
    sup: 'sup',
    svg: 'svg',
    title: 'title',
    ul: 'ul',

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
