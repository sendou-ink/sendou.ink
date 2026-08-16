import { getContext, setContext } from "svelte";

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

const KEY = Symbol("select");

export function setSelectContext(context: SelectContext) {
	setContext(KEY, context);
}

export function getSelectContext(): SelectContext {
	const context = getContext<SelectContext>(KEY);
	if (!context) {
		throw new Error("Select items must be used inside <Select>");
	}
	return context;
}
