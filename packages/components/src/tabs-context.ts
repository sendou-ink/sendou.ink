import { getContext, setContext } from "svelte";

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

const KEY = Symbol("tabs");

export function setTabsContext(context: TabsContext) {
	setContext(KEY, context);
}

export function getTabsContext(): TabsContext {
	const context = getContext<TabsContext>(KEY);
	if (!context) {
		throw new Error("Tabs components must be used inside <Tabs>");
	}
	return context;
}
