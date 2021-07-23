import React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';

import Signal from '../util/Signal';

import * as SelectedNote from '../app/selectedNote';
import * as EditName from '../app/editName';
import * as App from '../app';
import * as Focus from '../app/focus';

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
};
const Input = ({ setName, editName, setEditName }: InputProps) => {
  const ref = React.useRef<HTMLInputElement>(null);
  const focused = Signal.useSignal(Focus.titlebarFocused);
  React.useEffect(() => {
    const input = ref.current;
    if (input) {
      if (focused) {
        input.focus();
        input.setSelectionRange(0, editName.length);
      }
    }
  }, [focused]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setEditName(e.currentTarget.value);
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter': {
        setName(editName);
        Focus.focusEditor();
        e.preventDefault();
        break;
      }

      case 'Escape': {
        setEditName(undefined);
        Focus.focusEditor();
        e.preventDefault();
        break;
      }
    }
  }

  const onFocus = () => {
    Focus.focusTitlebar();
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
    onFocus={onFocus}
  />;
}

export default () => {
  const name = Signal.useSignal(SelectedNote.selectedNote);
  const setName = Signal.useSignal(App.setNameSignal);
  const editName = Signal.useSignal(EditName.editNameCell);
  const setEditName = EditName.setEditName;

  const onClick = () => name && setEditName(name)

  if (editName === undefined) {
    return <InputBox onClick={onClick}>{name}</InputBox>;
  } else {
    return <Input
      setName={setName}
      editName={editName}
      setEditName={setEditName}
    />;
  }
};
