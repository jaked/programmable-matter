import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { TwitterTweetEmbed } from 'react-twitter-embed';

/* Import Components */
import { HelloWorld } from './components/HelloWorld';
import { Display } from './components/Display';
import { Editor } from './components/Editor';

const tweet = <TwitterTweetEmbed tweetId={'839303032403714048'} />

ReactDOM.render(tweet, document.getElementById('main'));
