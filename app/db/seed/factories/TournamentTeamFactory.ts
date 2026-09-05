import { addDays } from "date-fns";
import type { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import invariant from "~/utils/invariant";
import { actAs } from "../core/actAs";
import { backdate } from "../core/backdate";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";
import * as ImageFactory from "./ImageFactory";

type InsertArgs = Omit<
	Parameters<typeof TournamentTeamRepository.insert>[0],
	"userId" | "additionalMemberUserIds"
> & {
	/** The team's members, the first of them its owner. */
	memberUserIds: number[];
	/** Gives the team a logo, submitted by its owner. */
	hasAvatar?: boolean;
	/** Counterpick map pool, for tournaments whose map picking style asks teams for one. */
	mapPool?: MapPool;
	/** When the team registered, for one that should look older than now. */
	registeredAt?: Date;
};

type Options = {
	/** Has the team checked in to the tournament? */
	isCheckedIn?: boolean;
	/** Is the team looking for more players on the tournament's LFG page? */
	isLooking?: boolean;
};

/**
 * Registered by the first of `memberUserIds`, the rest added like in production. A player looking for a
 * team is a placeholder team instead, see `TournamentLFGTeamFactory`.
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
	insert: async ({
		memberUserIds,
		hasAvatar,
		mapPool,
		registeredAt,
		...args
	}: InsertArgs) => {
		const [ownerUserId, ...additionalMemberUserIds] = memberUserIds;
		invariant(ownerUserId, "A team needs at least an owner");

		const avatarImgId = hasAvatar
			? (
					await ImageFactory.create(
						{ submitterUserId: ownerUserId },
						{ isValidated: true },
					)
				).id
			: args.avatarImgId;

		const team = await actAs(ownerUserId, () =>
			TournamentTeamRepository.insert({
				...args,
				avatarImgId,
				userId: ownerUserId,
				additionalMemberUserIds,
			}),
		);

		if (mapPool) {
			await TournamentTeamRepository.upsertCounterpickMaps({
				tournamentTeamId: team.id,
				mapPool,
			});
		}

		if (registeredAt) {
			await backdate("TournamentTeam", team.id, { createdAt: registeredAt });
		}

		return { id: team.id, ownerUserId, memberUserIds };
	},
	applyOptions: async (team, { isCheckedIn, isLooking }: Options) => {
		if (isCheckedIn) {
			await actAs(team.ownerUserId, () =>
				TournamentTeamRepository.checkIn(team.id),
			);
		}

		if (isLooking) {
			await TournamentLFGRepository.startLooking({
				teamId: team.id,
				chatRoomExpiresAt: addDays(new Date(), 7),
			});
		}
	},
});
