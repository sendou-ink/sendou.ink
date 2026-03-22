import useSWRImmutable from "swr/immutable";
import type { PatronsListLoaderData } from "~/features/front-page/routes/patrons-list";
import type { FriendsForAddingLoaderData } from "~/features/sendouq/routes/friends-for-adding";
import type { WeaponUsageLoaderData } from "~/features/sendouq/routes/weapon-usage";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { logger } from "~/utils/logger";
import {
	GET_FRIENDS_FOR_ADDING_ROUTE,
	getWeaponUsage,
	PATRONS_LIST_ROUTE,
} from "~/utils/urls";

// TODO: replace with useFetcher after proper errr handling is implemented https://github.com/remix-run/react-router/discussions/10013

const fetcher = (key: string) => async (url: string) => {
	const res = await fetch(url);
	if (res.status !== 200) {
		logger.error(`swr error ${key}: status code ${res.status}`);
		throw new Error("fetching failed");
	}
	return res.json();
};

export function useWeaponUsage(args: {
	userId: number;
	season: number;
	modeShort: ModeShort;
	stageId: StageId;
}) {
	const { data, error } = useSWRImmutable<WeaponUsageLoaderData>(
		getWeaponUsage(args),
		fetcher("getWeaponUsage"),
	);

	return {
		weaponUsage: data?.usage,
		isLoading: !error && !data,
		isError: error,
	};
}

export function useFriendsForAdding() {
	const { data, error } = useSWRImmutable<FriendsForAddingLoaderData>(
		GET_FRIENDS_FOR_ADDING_ROUTE,
		fetcher(GET_FRIENDS_FOR_ADDING_ROUTE),
	);

	return {
		friends: data?.friendsForAdding.friends,
		teams: data?.friendsForAdding.teams,
		isLoading: !error && !data,
		isError: error,
	};
}

export function usePatrons() {
	const { data, error } = useSWRImmutable<PatronsListLoaderData>(
		PATRONS_LIST_ROUTE,
		fetcher(PATRONS_LIST_ROUTE),
	);

	return {
		patrons: data?.patrons,
		isLoading: !error && !data,
		isError: error,
	};
}
