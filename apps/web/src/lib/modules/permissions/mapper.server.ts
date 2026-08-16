import { userDiscordIdIsAged } from "#lib/utils/users.ts";
import type { Role } from "./types.ts";
import {
	isAdmin,
	isDev,
	isQa,
	isScannerTester,
	isStaff,
	isSupporter,
} from "./utils.ts";

/** Derives the user's global roles from their user row (joined with `PlusTier`). */
export function userRoles(user: {
	id: number;
	discordId: string;
	plusTier: number | null;
	isArtist: number;
	isTournamentOrganizer: number;
	isVideoAdder: number;
	isApiAccesser: number;
	patronTier: number | null;
}) {
	const result: Array<Role> = [];

	if (isAdmin(user)) {
		result.push("ADMIN");
	}

	if (isStaff(user) || isAdmin(user)) {
		result.push("STAFF");
	}

	if (isDev(user)) {
		result.push("DEV");
	}

	if (isQa(user)) {
		result.push("QA");
	}

	if (isScannerTester(user)) {
		result.push("SCANNER_TESTER");
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

	if (userDiscordIdIsAged(user) || isSupporter(user)) {
		result.push("CALENDAR_EVENT_ADDER");
	}

	if (user.isTournamentOrganizer || user.isApiAccesser || isSupporter(user)) {
		result.push("API_ACCESSER");
	}

	return result;
}
