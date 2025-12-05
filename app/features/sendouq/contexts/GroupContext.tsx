import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { SQOwnGroup } from "../core/SQManager.server";

type GroupContextType = {
	ownGroup?: SQOwnGroup;
	isGroupOwner: boolean;
	isGroupManager: boolean;
	isExpired: boolean; // xxx: rename
};

const GroupContext = createContext<GroupContextType | null>(null);

export function GroupProvider({
	children,
	ownGroup,
	isGroupOwner,
	isGroupManager,
	isExpired,
}: {
	children: ReactNode;
} & GroupContextType) {
	return (
		<GroupContext.Provider
			value={{ ownGroup, isGroupOwner, isGroupManager, isExpired }}
		>
			{children}
		</GroupContext.Provider>
	);
}

export function useOwnGroup() {
	const context = useContext(GroupContext);
	if (!context) {
		throw new Error("useOwnGroup must be used within GroupProvider");
	}
	return context;
}
