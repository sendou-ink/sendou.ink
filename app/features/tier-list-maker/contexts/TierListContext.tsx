import type { ReactNode } from "react";
import { createContext, useContext, useRef, useState } from "react";
import { useTierList } from "../hooks/useTierList";
import { DEFAULT_TIER_LABEL_WIDTH } from "../tier-list-maker-constants";

type TierListContextType = ReturnType<typeof useTierList> & {
	screenshotMode: boolean;
	setScreenshotMode: (value: boolean) => void;
	tierLabelWidth: number;
	registerTierLabelWidth: (tierId: string, width: number) => void;
	unregisterTierLabelWidth: (tierId: string) => void;
};

const TierListContext = createContext<TierListContextType | null>(null);

export function TierListProvider({ children }: { children: ReactNode }) {
	const state = useTierList();
	const [screenshotMode, setScreenshotMode] = useState(false);
	const [tierLabelWidth, setTierLabelWidth] = useState(
		DEFAULT_TIER_LABEL_WIDTH,
	);
	const widthsRef = useRef<Map<string, number>>(new Map());

	const registerTierLabelWidth = (tierId: string, width: number) => {
		widthsRef.current.set(tierId, width);
		const maxWidth = Math.max(...widthsRef.current.values());
		if (maxWidth !== tierLabelWidth) {
			setTierLabelWidth(maxWidth);
		}
	};

	const unregisterTierLabelWidth = (tierId: string) => {
		widthsRef.current.delete(tierId);
		const values = [...widthsRef.current.values()];
		const maxWidth =
			values.length > 0 ? Math.max(...values) : DEFAULT_TIER_LABEL_WIDTH;
		if (maxWidth !== tierLabelWidth) {
			setTierLabelWidth(maxWidth);
		}
	};

	return (
		<TierListContext.Provider
			value={{
				...state,
				screenshotMode,
				setScreenshotMode,
				tierLabelWidth,
				registerTierLabelWidth,
				unregisterTierLabelWidth,
			}}
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
