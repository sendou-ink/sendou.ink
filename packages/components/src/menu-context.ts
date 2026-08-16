import { getContext, setContext } from "svelte";

export interface MenuTriggerProps {
	readonly popovertarget: string;
	readonly "aria-expanded": boolean;
	readonly "aria-haspopup": "menu";
}

export interface MenuContext {
	close: () => void;
}

const KEY = Symbol("menu");

export function setMenuContext(context: MenuContext) {
	setContext(KEY, context);
}

export function getMenuContext(): MenuContext {
	const context = getContext<MenuContext>(KEY);
	if (!context) {
		throw new Error("Menu items must be used inside <Menu>");
	}
	return context;
}
