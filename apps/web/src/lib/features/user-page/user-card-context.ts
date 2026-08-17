import { createContext } from "svelte";
import type { UserCardData } from "./user-card-types.ts";

export interface UserCardContext {
	/** Card data by user id, as returned by `UserCardRepository.findAllByUserIds`. */
	userCards: () => Map<number, UserCardData> | undefined;
}

const [getOrThrow, set] = createContext<UserCardContext>();

/** Provides `UserCard` data for the subtree; pages whose queries include `userCards` set this. */
export const setUserCardContext = set;

/**
 * The nearest provided {@link UserCardContext}, or `undefined` when no ancestor set one —
 * `UserCard` then renders its children plain without the popover.
 */
export function getUserCardContext(): UserCardContext | undefined {
	try {
		return getOrThrow();
	} catch {
		return undefined;
	}
}
