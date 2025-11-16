import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { useTierList } from "../hooks/useTierListState";

type TierListContextType = ReturnType<typeof useTierList>;

const TierListContext = createContext<TierListContextType | null>(null);

export function TierListProvider({ children }: { children: ReactNode }) {
	const state = useTierList();

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
