import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

type InsertArgs = Parameters<typeof TournamentTeamRepository.insert>[0];

type Options = {
	/** Has the team checked in to the tournament? */
	isCheckedIn: boolean;
};

/**
 * Creates tournament teams. `userId` is the owner, on whose behalf the team is
 * registered; the members named by `additionalMemberUserIds` are added to it the
 * way they are in production. Invite code and in-game names are the repository's own.
 */
export const { create } = defineFactory({
	defaults: () => ({
		team: {
			name: faker.company.name(),
			prefersNotToHost: 0 as const,
			teamId: null,
		},
		additionalMemberUserIds: [],
		avatarImgId: null,
	}),
	insert: async ({ userId, ...args }: InsertArgs) => {
		const team = await actAs(userId, () =>
			TournamentTeamRepository.insert({ ...args, userId }),
		);

		return { id: team.id, ownerUserId: userId };
	},
	applyOptions: async (team, { isCheckedIn }: Options) => {
		if (!isCheckedIn) return;

		await actAs(team.ownerUserId, () =>
			TournamentTeamRepository.checkIn(team.id),
		);
	},
});
