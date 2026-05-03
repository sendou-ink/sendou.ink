import * as React from "react";
import type { MainWeaponId } from "~/modules/in-game-lists/types";

const LOCAL_STORAGE_KEY = "sq__recently-reported-weapons";
const MAX_REPORTED_WEAPONS = 7;

/**
 * This hook provides access to the list of recently reported weapons,
 * which is persisted in local storage, and a function to add a new weapon
 * to the list. The list is automatically loaded from local storage when
 * the hook is first used.
 *
 * If a weapon is added that already exists in the list, it will be moved to the front of the list.
 * If the list exceeds the maximum number of reported weapons, the oldest weapon will be removed.
 */
export function useRecentlyReportedWeapons() {
	const [recentlyReportedWeapons, setReportedWeapons] = React.useState<
		MainWeaponId[]
	>([]);

	React.useEffect(() => {
		setReportedWeapons(getReportedWeaponsFromLocalStorage());
	}, []);

	const addRecentlyReportedWeapon = (weapon: MainWeaponId) => {
		const newList = addReportedWeaponToLocalStorage(weapon);
		setReportedWeapons(newList);
	};

	return { recentlyReportedWeapons, addRecentlyReportedWeapon };
}

const getReportedWeaponsFromLocalStorage = (): MainWeaponId[] => {
	const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
	if (!stored) return [];
	return JSON.parse(stored);
};

/** Adds weapon to list of recently reported weapons to local storage returning the current list */
const addReportedWeaponToLocalStorage = (weapon: MainWeaponId) => {
	const stored = getReportedWeaponsFromLocalStorage();

	const otherWeapons = stored.filter((storedWeapon) => storedWeapon !== weapon);

	if (otherWeapons.length >= MAX_REPORTED_WEAPONS) {
		otherWeapons.pop();
	}

	const newList = [weapon, ...otherWeapons];

	localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newList));

	return newList;
};
