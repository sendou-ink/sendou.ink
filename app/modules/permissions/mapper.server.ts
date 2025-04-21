import type { UserWithPlusTier } from "~/db/tables";
import { userDiscordIdIsAged } from "~/utils/users";
import type { Role } from "./types";
import { isAdmin, isStaff, isSupporter } from "./utils";

export function userRoles(
	user: Pick<
		UserWithPlusTier,
		| "id"
		| "discordId"
		| "plusTier"
		| "isArtist"
		| "isTournamentOrganizer"
		| "isVideoAdder"
		| "patronTier"
	>,
) {
	const result: Array<Role> = [];

	if (isAdmin(user)) {
		result.push("ADMIN");
	}

	if (isStaff(user) || isAdmin(user)) {
		result.push("STAFF");
	}

	if (typeof user.patronTier === "number") {
		result.push("MINOR_SUPPORT");
	}

	if (isSupporter(user)) {
		result.push("SUPPORTER");
	}

	if (typeof user.plusTier === "number") {
		result.push("PLUS_SERVER_MEMBER");
	}

	if (user.isArtist) {
		result.push("ARTIST");
	}

	if (user.isVideoAdder) {
		result.push("VIDEO_ADDER");
	}

	if (user.isTournamentOrganizer || isSupporter(user)) {
		result.push("TOURNAMENT_ADDER");
	}

	if (userDiscordIdIsAged(user)) {
		result.push("CALENDAR_EVENT_ADDER");
	}

	return result;
}
