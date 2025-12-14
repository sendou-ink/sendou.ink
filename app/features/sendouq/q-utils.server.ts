import { redirect } from "@remix-run/node";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PAGE,
	SENDOUQ_PREPARING_PAGE,
	sendouQMatchPage,
} from "~/utils/urls";
import type { SQOwnGroup } from "./core/SQManager.server";

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
