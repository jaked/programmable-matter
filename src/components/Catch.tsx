import * as React from 'react'
import { Box } from 'rebass'

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

  componentDidCatch (err: Error) {
    console.error(err)
    this.setState({ err })
  }

  render () {
    const { err } = this.state
    if (err) {
      return (
        <Box
          is='pre'
          color='white'
          bg='red'
          p={2}
          children={err.toString()}
        />
      )
    }
    try {
      return (
        <React.Fragment>
          {this.props.children}
        </React.Fragment>
      )
    } catch (e) {
      console.error(e)
      return false
    }
  }
}
