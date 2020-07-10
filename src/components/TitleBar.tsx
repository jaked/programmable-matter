import React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';

type Props = {
  slug: string;
  setSlug: (s: string) => void;
  editSlug: string | undefined;
  setEditSlug: (s: string | undefined) => void;
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

export default ({ slug, setSlug, editSlug, setEditSlug }) => {
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setEditSlug(e.currentTarget.value);
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter': {
        setSlug(editSlug);
        e.preventDefault();
        break;
      }

      case 'Escape': {
        setEditSlug(undefined);
        e.preventDefault();
        break;
      }
    }
  }
  const onClick = () => {
    setEditSlug(slug);
  }
  const onBlur = () => {
    setEditSlug(undefined);
  }

  if (editSlug === undefined) {
    return <InputBox onClick={onClick}>{slug}</InputBox>;
  } else {
    return <Input
      value={editSlug}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    />;
  }
};
