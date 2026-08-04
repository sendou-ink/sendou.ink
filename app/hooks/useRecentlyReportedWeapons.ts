import * as React from "react";
import type { MainWeaponId } from "~/modules/in-game-lists/types";

const LOCAL_STORAGE_KEY = "sq__recently-reported-weapons";
const MAX_REPORTED_WEAPONS = 7;

const listeners = new Set<() => void>();

/**
 * This hook provides access to the list of recently reported weapons,
 * which is persisted in local storage, and a function to add a new weapon
 * to the list.
 *
 * If a weapon is added that already exists in the list, it will be moved to the front of the list.
 * If the list exceeds the maximum number of reported weapons, the oldest weapon will be removed.
 */
export function useRecentlyReportedWeapons() {
	const raw = React.useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);

	const recentlyReportedWeapons = parseReportedWeapons(raw);

	const addRecentlyReportedWeapon = (weapon: MainWeaponId) => {
		addReportedWeaponToLocalStorage(weapon);
		for (const listener of listeners) {
			listener();
		}
	};

	return { recentlyReportedWeapons, addRecentlyReportedWeapon };
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	window.addEventListener("storage", listener);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", listener);
	};
}

function getSnapshot() {
	return localStorage.getItem(LOCAL_STORAGE_KEY) ?? "[]";
}

function getServerSnapshot() {
	return "[]";
}

function parseReportedWeapons(raw: string): MainWeaponId[] {
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/** Adds weapon to list of recently reported weapons to local storage returning the current list */
const addReportedWeaponToLocalStorage = (weapon: MainWeaponId) => {
	const stored = parseReportedWeapons(getSnapshot());

	const otherWeapons = stored.filter((storedWeapon) => storedWeapon !== weapon);

	if (otherWeapons.length >= MAX_REPORTED_WEAPONS) {
		otherWeapons.pop();
	}

	const newList = [weapon, ...otherWeapons];

	localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newList));

	return newList;
};
