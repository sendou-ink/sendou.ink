import useSWR from "swr";
import useSWRImmutable from "swr/immutable";
import type { EventsWithMapPoolsLoaderData } from "~/features/calendar/routes/map-pool-events";
import type { PatronsListLoaderData } from "~/features/front-page/routes/patrons-list";
import type { NotificationsLoaderData } from "~/features/notifications/routes/notifications.peek";
import type { TrustersLoaderData } from "~/features/sendouq/routes/trusters";
import type { WeaponUsageLoaderData } from "~/features/sendouq/routes/weapon-usage";
import type { ModeShort, StageId } from "~/modules/in-game-lists";
import {
	GET_ALL_EVENTS_WITH_MAP_POOLS_ROUTE,
	GET_TRUSTERS_ROUTE,
	NOTIFICATIONS_PEAK_ROUTE,
	PATRONS_LIST_ROUTE,
	getWeaponUsage,
} from "~/utils/urls";
import { useUser } from "../features/auth/core/user";

// TODO: replace with useFetcher after proper errr handling is implemented https://github.com/remix-run/react-router/discussions/10013

const fetcher = (key: string) => async (url: string) => {
	const res = await fetch(url);
	if (res.status !== 200) {
		console.error(`swr error ${key}: status code ${res.status}`);
		throw new Error("fetching failed");
	}
	return res.json();
};

export function useAllEventsWithMapPools() {
	const { data, error } = useSWRImmutable<EventsWithMapPoolsLoaderData>(
		GET_ALL_EVENTS_WITH_MAP_POOLS_ROUTE,
		fetcher(GET_ALL_EVENTS_WITH_MAP_POOLS_ROUTE),
	);

	return {
		events: data?.events,
		isLoading: !error && !data,
		isError: error,
	};
}

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

export function useTrusted() {
	const { data, error } = useSWRImmutable<TrustersLoaderData>(
		GET_TRUSTERS_ROUTE,
		fetcher(GET_TRUSTERS_ROUTE),
	);

	return {
		trusters: data?.trusters.trusters,
		teams: data?.trusters.teams,
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

export function useNotifications() {
	const user = useUser();
	const { data, error, mutate, isValidating } = useSWR<NotificationsLoaderData>(
		user ? NOTIFICATIONS_PEAK_ROUTE : null,
		fetcher(NOTIFICATIONS_PEAK_ROUTE),
	);

	return {
		notifications: data?.notifications,
		isLoading: isValidating || (!error && !data),
		isError: error,
		refresh: () => mutate(),
	};
}
