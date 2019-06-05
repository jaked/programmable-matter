import * as React from 'react'

// borrowed from ok-mdx
// this is a weirdly stateful way to handle errors, is there a better way?

interface Props {}

interface State {
  err: Error | null
}

export class Catch extends React.Component<Props, State> {
  state: State = {
    err: null
  }

  componentDidUpdate (prev: any /* Readonly<Props> */) {
    // the type Readonly<Props> doesn't include children
    // but it seems to be present; if we leave off this check
    // we get an infinite loop of setState / componentDidUpdate
    if (prev.children !== this.props.children) {
      this.setState({ err: null })
    }
  }

  static getDerivedStateFromError(e: Error) {
    return { err: e };
  }

  componentDidCatch (err: Error) {
    console.error(err)
  }

  render () {
    const { err } = this.state
    if (err) {
      return (
        <pre>{err.toString()}</pre>
      );
    }
    return this.props.children
  }
}
