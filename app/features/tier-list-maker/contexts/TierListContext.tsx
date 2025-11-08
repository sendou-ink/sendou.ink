import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { useTierListState as useTierListStateHook } from "../hooks/useTierListState";

type TierListContextType = ReturnType<typeof useTierListStateHook>;

const TierListContext = createContext<TierListContextType | null>(null);

export function TierListProvider({ children }: { children: ReactNode }) {
	const state = useTierListStateHook();

	return (
		<TierListContext.Provider value={state}>
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
