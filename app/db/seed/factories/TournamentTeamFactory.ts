import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import invariant from "~/utils/invariant";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

type InsertArgs = Omit<
	Parameters<typeof TournamentTeamRepository.insert>[0],
	"userId" | "additionalMemberUserIds"
> & {
	/** The team's members, the first of them its owner. */
	memberUserIds: number[];
};

type Options = {
	/** Has the team checked in to the tournament? */
	isCheckedIn?: boolean;
	/** Is the team looking for more players on the tournament's LFG page? */
	isLooking?: boolean;
};

/**
 * Creates tournament teams. The first of `memberUserIds` is the owner, on whose
 * behalf the team is registered; the rest are added to it the way they are in
 * production. Invite code and in-game names are the repository's own.
 *
 * A player looking for a team without one to register is a placeholder team
 * instead, see `TournamentLFGTeamFactory`.
 */
export const { create } = defineFactory({
	defaults: () => ({
		team: {
			name: faker.company.name(),
			prefersNotToHost: 0 as const,
			teamId: null,
		},
		avatarImgId: null,
	}),
	insert: async ({ memberUserIds, ...args }: InsertArgs) => {
		const [ownerUserId, ...additionalMemberUserIds] = memberUserIds;
		invariant(ownerUserId, "A team needs at least an owner");

		const team = await actAs(ownerUserId, () =>
			TournamentTeamRepository.insert({
				...args,
				userId: ownerUserId,
				additionalMemberUserIds,
			}),
		);

		return { id: team.id, ownerUserId, memberUserIds };
	},
	applyOptions: async (team, { isCheckedIn, isLooking }: Options) => {
		if (isCheckedIn) {
			await actAs(team.ownerUserId, () =>
				TournamentTeamRepository.checkIn(team.id),
			);
		}

		if (isLooking) {
			await TournamentLFGRepository.startLooking(team.id);
		}
	},
});
