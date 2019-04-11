import * as React from 'react';
import { UnorderedList } from './UnorderedList';

const dependenciesArray = [
  'express - middleware for the node server',
  'react - for generating the views of the app',
  'react-dom - powers the rendering of elements to the DOM, typically paired with React',
  'webpack - for bundling all the javascript',
  'webpack-cli - command line support for webpack',
  'jsx-loader - allows webpack to load jsx files'
];

const componentsMade = [
  'HelloWorld - which is the view you are seeing now!',
  'UnorderedList - which takes an array of "items" and returns a <ul> element with <li>, elements of each of those items within it',
];

/* the main page for the index route of this app */
export class HelloWorld extends React.Component<any, any> {
  render() {
    return (
      <div>
        <h1>Hello World!!</h1>

        <p>This is a starter <a href="http://glitch.com">Glitch</a> app for React! It uses 
          only a few dependencies to get you started on working with React:</p>

        <UnorderedList items={dependenciesArray} />

        <p>Look in <code>app/components/</code> for two example components:</p>

        <UnorderedList items={componentsMade} />
      </div>
    );
  }
};
