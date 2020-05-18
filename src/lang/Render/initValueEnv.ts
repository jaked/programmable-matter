import { remote } from 'electron';
import * as Url from 'url';

import * as Immutable from 'immutable';

import * as React from 'react';

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

function Link(
  setSelected: (note: string) => void,
) {
  return function ({ to, children }: { to: string, children: React.ReactNodeArray }) {
    // TODO(jaked) validate URL
    const url = Url.parse(to);
    if (url.protocol && url.slashes && url.hostname) {
      const onClick = (e: React.MouseEvent) => {
        e.preventDefault();
        remote.shell.openExternal(to);
      }
      return React.createElement('a', { href: to, onClick }, children);
    } else {
      const onClick = (e: React.MouseEvent) => {
        e.preventDefault();
        setSelected(to);
      }
      // this href is used when note is rendered statically
      // TODO(jaked)
      // handle path components properly
      // handle mounting note tree somewhere other than / ?
      const href = `/${encodeURIComponent(to)}`;
      return React.createElement('a', { href: href, onClick }, children);
    }
  }
}

export function initValueEnv(
  setSelected: (note: string) => void,
): Env {
  return Immutable.Map({
    a: 'a',
    body: 'body',
    button: 'button',
    code: 'pre',
    div: 'div',
    ellipse: 'ellipse',
    footer: 'footer',
    h1: 'h1',
    head: 'head',
    header: 'header',
    html: 'html',
    img: 'img',
    inlineCode: 'code',
    input: 'input',
    label: 'label',
    li: 'li',
    section: 'section',
    span: 'span',
    strong: 'strong',
    style: 'style',
    svg: 'svg',
    title: 'title',
    ul: 'ul',

    Link: Link(setSelected),
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

    parseInt: (s: string) => parseInt(s)
  }).map(Signal.ok);
}
