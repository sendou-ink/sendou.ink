import * as React from "react";
import type { MainWeaponId } from "~/modules/in-game-lists";

const LOCAL_STORAGE_KEY = "sq__reported-weapons";
const MAX_REPORTED_WEAPONS = 6;

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
