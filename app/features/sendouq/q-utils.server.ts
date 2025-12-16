import { redirect } from "@remix-run/node";
import { TIERS } from "~/features/mmr/mmr-constants";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PAGE,
	SENDOUQ_PREPARING_PAGE,
	sendouQMatchPage,
} from "~/utils/urls";
import type { SQOwnGroup } from "./core/SendouQ.server";

/** Error class for SendouQ (expected) errors */
export class SendouQError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SendouQError";
	}
}

function groupRedirectLocation(group?: SQOwnGroup) {
	if (group?.status === "PREPARING") return SENDOUQ_PREPARING_PAGE;
	if (group?.matchId) return sendouQMatchPage(group.matchId);
	if (group) return SENDOUQ_LOOKING_PAGE;

	return SENDOUQ_PAGE;
}

/** User needs to be on certain page depending on their SendouQ group status. This functions throws a `Redirect` if they are trying to load the wrong page. */
export function sqRedirectIfNeeded({
	ownGroup,
	currentLocation,
}: {
	ownGroup?: SQOwnGroup;
	currentLocation: "default" | "preparing" | "looking" | "match";
}) {
	const newLocation = groupRedirectLocation(ownGroup);

	// we are already in the correct location, don't redirect
	if (currentLocation === "default" && newLocation === SENDOUQ_PAGE) return;
	if (currentLocation === "preparing" && newLocation === SENDOUQ_PREPARING_PAGE)
		return;
	if (currentLocation === "looking" && newLocation === SENDOUQ_LOOKING_PAGE)
		return;
	if (currentLocation === "match" && newLocation.includes("match")) return;

	throw redirect(newLocation);
}

const allTiersOrdered = TIERS.flatMap((t) => [
	{ name: t.name, isPlus: true },
	{ name: t.name, isPlus: false },
]).reverse();
const allTiersOrderedWithLeviathan = allTiersOrdered.filter(
	(t) => t.name !== "LEVIATHAN",
);

export function getTierIndex(
	tier: TieredSkill["tier"] | null | undefined,
	isAccurateTiers: boolean,
) {
	if (!tier) return null;

	const tiers = isAccurateTiers
		? allTiersOrdered
		: allTiersOrderedWithLeviathan;

	const index = tiers.findIndex(
		(t) => t.name === tier.name && t.isPlus === tier.isPlus,
	);

	return index === -1 ? null : index;
}
