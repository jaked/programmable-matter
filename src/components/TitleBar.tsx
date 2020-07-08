import React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import Signal from '../util/Signal';
import { bug } from '../util/bug';

type Props = {
  slug: string | null;
  setSlug: (s: string) => void;
  setSelected: (s: string) => void;
  render: () => void;
}

const Box = styled(BoxBase)({
  padding: '6px',
  borderBottom: '1px solid #cccccc',
  height: '32px',
});

const StyledInput = styled.input({
  boxSizing: 'border-box',
  borderStyle: 'none',
  outline: 'none',
  fontSize: '14px',
  width: '100%',
});

type InputProps = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onBlur: () => void;
};
const Input = ({ value, onChange, onKeyDown, onBlur }: InputProps) => {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(0, value.length);
    }
  }, []);
  return <StyledInput
    ref={ref}
    type='text'
    maxLength={100}
    value={value}
    onChange={onChange}
    onKeyDown={onKeyDown}
    onBlur={onBlur}
  />;
}

export default Signal.lift<Props>(({ slug, setSlug, setSelected, render }) => {
  if (slug === null)
    return <Box />
  else {
    // we want to clear the editing state when the slug prop changes
    // and we'd like the editing state to be local to TitleBar
    // recreating the state signal accomplishes this
    // TODO(jaked) maybe there's a better way to go about it
    // e.g. React.useState + React.useEffect to clear
    // or React.useRef(Signal..., [slug]) ?

    const editSlugCell = Signal.cellOk<undefined | string>(undefined, render);
    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      e.preventDefault();
      editSlugCell.setOk(e.currentTarget.value);
    }
    const onKeyDown = (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Enter': {
          const newSlug = editSlugCell.get() ?? bug(`expected slug in editSlugCell`);
          setSlug(newSlug);
          setSelected(newSlug);
          editSlugCell.setOk(undefined);
          e.preventDefault();
          break;
        }

        case 'Escape': {
          editSlugCell.setOk(undefined);
          e.preventDefault();
          break;
        }
      }
    }
    const onClick = () => {
      editSlugCell.setOk(slug);
    }
    const onBlur = () => {
      editSlugCell.setOk(undefined);
    }

    return <Box><Signal.node signal={editSlugCell.map(editSlug => {
      if (editSlug === undefined) {
        return <span onClick={onClick}>{slug}</span>;
      } else {
        return <Input
          value={editSlug}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />;
      }
    })
    }/></Box>
  }
});
