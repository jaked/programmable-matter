import Signal from '../util/Signal';

export const editNameCell = Signal.cellOk<string | undefined>(undefined);
export const setEditName = (editName: string | undefined) => editNameCell.setOk(editName)
