import * as React from "react";
import { useUser } from "~/features/auth/core/user";

const SESSION_STORAGE_KEY = "spoilerFreeRevealed";

const listeners = new Set<() => void>();

function setRevealedIds(ids: number[]) {
	sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(ids));
	for (const listener of listeners) {
		listener();
	}
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function getSnapshot() {
	return sessionStorage.getItem(SESSION_STORAGE_KEY) ?? "[]";
}

function getServerSnapshot() {
	return "[]";
}

export function useSpoilerFree() {
	const user = useUser();
	const raw = React.useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);
	let revealedIds: number[];
	try {
		revealedIds = JSON.parse(raw);
	} catch {
		revealedIds = [];
	}

	const isEnabled = Boolean(user?.preferences.spoilerFreeMode);

	const isCensored = (tournamentId: number) =>
		isEnabled && !revealedIds.includes(tournamentId);

	const reveal = (tournamentId: number) => {
		setRevealedIds([...revealedIds, tournamentId]);
	};

	const hide = (tournamentId: number) => {
		setRevealedIds(revealedIds.filter((id) => id !== tournamentId));
	};

	return { isEnabled, isCensored, reveal, hide };
}
