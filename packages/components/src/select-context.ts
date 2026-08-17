import { createContext } from "svelte";

export interface SelectContext {
	readonly selectedKey: string | number | null;
	readonly focusedKey: string | number | null;
	registerItem: (
		key: string | number,
		element: HTMLElement,
		options: { textValue: string; disabled: boolean },
	) => () => void;
	select: (key: string | number) => void;
	setFocusedKey: (key: string | number | null) => void;
}

export const [getSelectContext, setSelectContext] =
	createContext<SelectContext>();
