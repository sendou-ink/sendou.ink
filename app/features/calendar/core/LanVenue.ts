/**
 * Venues of the LAN map: of the LANs held at the same place (e.g. a local series running every month at the same
 * hall) only the next one gets a marker, instead of them all stacking on top of each other.
 */

import * as R from "remeda";

/** Decimals of the coordinates compared, ~10 m, so the same venue picked again with a slightly different geocode still matches. */
const LOCATION_PRECISION = 4;

/**
 * The first of `lans` at each venue location, in the order of `lans`. With `lans` soonest first that's each venue's
 * next LAN.
 */
export function firstPerLocation<
	T extends { venue: { latitude: number; longitude: number } },
>(lans: T[]) {
	return R.uniqueBy(lans, (lan) => locationKey(lan.venue));
}

function locationKey({
	latitude,
	longitude,
}: {
	latitude: number;
	longitude: number;
}) {
	return `${latitude.toFixed(LOCATION_PRECISION)},${longitude.toFixed(LOCATION_PRECISION)}`;
}
