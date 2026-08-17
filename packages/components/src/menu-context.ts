import { createContext } from "svelte";

export interface MenuTriggerProps {
	readonly popovertarget: string;
	readonly "aria-expanded": boolean;
	readonly "aria-haspopup": "menu";
}

export interface MenuContext {
	close: () => void;
}

export const [getMenuContext, setMenuContext] = createContext<MenuContext>();
