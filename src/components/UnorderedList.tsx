import * as React from 'react';

/* takes an array prop 'items' and returns a <ul> element 
   with each item as <li> elements */
export class UnorderedList extends React.Component<any, any> {
  constructor({ items }) {
    super({ items });
  }

  render() {
    return (
      <ul>
        {this.props.items.map(function(item, i) {
          return <li key={i}>{item}</li>;
        })}
      </ul>
    );
  }
}
