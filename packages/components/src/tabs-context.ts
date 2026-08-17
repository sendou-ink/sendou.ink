import { createContext } from "svelte";

export interface TabsContext {
	readonly selectedKey: string | null;
	readonly orientation: "horizontal" | "vertical";
	select: (key: string) => void;
	registerTab: (key: string, element: HTMLElement) => () => void;
	moveFocus: (
		fromKey: string,
		direction: "next" | "previous" | "first" | "last",
	) => void;
}

export const [getTabsContext, setTabsContext] = createContext<TabsContext>();
