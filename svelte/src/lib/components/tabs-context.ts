import { createContext } from "svelte";

export type TabsOrientation = "horizontal" | "vertical";

/** What `Tabs` shares with its `TabList`, `Tab`s and `TabPanel`s. */
export interface TabsContext {
	readonly selectedKey: string | null;
	readonly orientation: TabsOrientation;
	select: (key: string) => void;
	registerTab: (key: string, element: HTMLElement) => () => void;
	moveFocus: (
		fromKey: string,
		direction: "next" | "previous" | "first" | "last",
	) => void;
}

export const [getTabsContext, setTabsContext] = createContext<TabsContext>();
