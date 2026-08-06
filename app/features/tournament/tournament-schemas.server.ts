import { z } from "zod";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { _action } from "~/utils/zod";
import { registerTeamFormSchemaServer } from "./tournament-register-schemas.server";
import {
	addPlayerSchema,
	checkInSchema,
	deleteTeamMemberSchema,
	updateMapPoolSchema,
} from "./tournament-schemas";

export function registerSchema({
	tournament,
	ownTeamId,
}: {
	tournament: Tournament;
	ownTeamId?: number;
}) {
	return z.union([
		registerTeamFormSchemaServer({ tournament, ownTeamId }),
		updateMapPoolSchema,
		deleteTeamMemberSchema,
		z.object({
			_action: _action("LEAVE_TEAM"),
		}),
		checkInSchema,
		addPlayerSchema,
		z.object({
			_action: _action("UNREGISTER"),
		}),
	]);
}
