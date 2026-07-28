import * as TeamRepository from "~/features/team/TeamRepository.server";
import { TEAM } from "~/features/team/team-constants";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof TeamRepository.insert>[0] & {
	additionalMemberUserIds: number[];
};

/**
 * Creates teams. `ownerUserId` is the owner, whose membership the repository creates
 * with the team; the members named by `additionalMemberUserIds` join it the way they
 * do in production, within the team count a non-patron is allowed. Custom url and
 * invite code are the repository's own, the custom url following from the name.
 */
export const { create } = defineFactory({
	defaults: ({ seq }) => ({
		name: `Team ${seq}`,
		isMainTeam: true,
		additionalMemberUserIds: [],
	}),
	insert: async ({ additionalMemberUserIds, ...args }: InsertArgs) => {
		const team = await TeamRepository.insert(args);

		for (const userId of additionalMemberUserIds) {
			await actAs(userId, () =>
				TeamRepository.insertOwnMembership({
					teamId: team.id,
					maxTeamsAllowed: TEAM.MAX_TEAM_COUNT_NON_PATRON,
				}),
			);
		}

		return team;
	},
});
