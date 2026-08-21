import * as v from "valibot";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { _action } from "~/utils/schema";
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
	return v.unionAsync([
		registerTeamFormSchemaServer({ tournament, ownTeamId }),
		updateMapPoolSchema,
		deleteTeamMemberSchema,
		v.object({
			_action: _action("LEAVE_TEAM"),
		}),
		checkInSchema,
		addPlayerSchema,
		v.object({
			_action: _action("UNREGISTER"),
		}),
	]);
}
