import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import { useTierList } from "../hooks/useTierListState";

type TierListContextType = ReturnType<typeof useTierList> & {
	screenshotMode: boolean;
	setScreenshotMode: (value: boolean) => void;
};

const TierListContext = createContext<TierListContextType | null>(null);

export function TierListProvider({ children }: { children: ReactNode }) {
	const state = useTierList();
	const [screenshotMode, setScreenshotMode] = useState(false);

	return (
		<TierListContext.Provider
			value={{ ...state, screenshotMode, setScreenshotMode }}
		>
			{children}
		</TierListContext.Provider>
	);
}

export function useTierListState() {
	const context = useContext(TierListContext);
	if (!context) {
		throw new Error("useTierListState must be used within TierListProvider");
	}
	return context;
}
