import React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';

type Props = {
  name: string;
  setName: (s: string) => void;
  editName: string | undefined;
  setEditName: (s: string | undefined) => void;
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
  setName: (s: string) => void;
  editName: string;
  setEditName: (s: string | undefined) => void;
  focusEditor: () => void;
};
const Input = ({ setName, editName, setEditName, focusEditor }: InputProps) => {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(0, editName.length);
    }
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setEditName(e.currentTarget.value);
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter': {
        setName(editName);
        focusEditor();
        e.preventDefault();
        break;
      }

      case 'Escape': {
        setEditName(undefined);
        focusEditor();
        e.preventDefault();
        break;
      }
    }
  }
  const onBlur = () => {
    setEditName(undefined);
  }

  return <StyledInput
    ref={ref}
    type='text'
    maxLength={100}
    value={editName}
    onChange={onChange}
    onKeyDown={onKeyDown}
    onBlur={onBlur}
  />;
}

export default ({ name, setName, editName, setEditName, focusEditor }: Props) => {
  const onClick = () => setEditName(name)

  if (editName === undefined) {
    return <InputBox onClick={onClick}>{name}</InputBox>;
  } else {
    return <Input
      setName={setName}
      editName={editName}
      setEditName={setEditName}
      focusEditor={focusEditor}
    />;
  }
};
