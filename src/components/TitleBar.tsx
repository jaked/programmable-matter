import React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';

type Props = {
  slug: string;
  setSlug: (s: string) => void;
  editSlug: string | undefined;
  setEditSlug: (s: string | undefined) => void;
  focusEditor: () => void;
}

const InputBox = styled(BoxBase)({
  padding: '1px',
});

const StyledInput = styled.input({
  boxSizing: 'border-box',
  borderStyle: 'none',
  outline: 'none',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  width: '100%',
});

type InputProps = {
  setSlug: (s: string) => void;
  editSlug: string;
  setEditSlug: (s: string | undefined) => void;
  focusEditor: () => void;
};
const Input = ({ setSlug, editSlug, setEditSlug, focusEditor }: InputProps) => {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(0, editSlug.length);
    }
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setEditSlug(e.currentTarget.value);
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter': {
        setSlug(editSlug);
        focusEditor();
        e.preventDefault();
        break;
      }

      case 'Escape': {
        setEditSlug(undefined);
        focusEditor();
        e.preventDefault();
        break;
      }
    }
  }
  const onBlur = () => {
    setEditSlug(undefined);
  }

  return <StyledInput
    ref={ref}
    type='text'
    maxLength={100}
    value={editSlug}
    onChange={onChange}
    onKeyDown={onKeyDown}
    onBlur={onBlur}
  />;
}

export default ({ slug, setSlug, editSlug, setEditSlug, focusEditor }: Props) => {
  const onClick = () => setEditSlug(slug)

  if (editSlug === undefined) {
    return <InputBox onClick={onClick}>{slug}</InputBox>;
  } else {
    return <Input
      setSlug={setSlug}
      editSlug={editSlug}
      setEditSlug={setEditSlug}
      focusEditor={focusEditor}
    />;
  }
};
