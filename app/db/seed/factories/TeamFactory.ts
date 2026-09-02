import type { UserMapModePreferences } from "~/db/tables-json";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { type MemberRole, TEAM } from "~/features/team/team-constants";
import invariant from "~/utils/invariant";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";
import * as ImageFactory from "./ImageFactory";

type InsertArgs = Omit<
	Parameters<typeof TeamRepository.insert>[0],
	"ownerUserId"
> & {
	/** The team's members, the first of them its owner. */
	memberUserIds: number[];
};

type Options = {
	/** Gives the team a logo, submitted by its owner the way one is in production. */
	hasAvatar?: boolean;
	/** Filename of the logo; one seeded to the local image storage renders in dev. */
	avatarUrl?: string;
	/** SendouQ map & mode preferences, saved as the team edit page saves them. */
	mapModePreferences?: UserMapModePreferences;
	/** Roles of the members, keyed by user id, saved as the roster page saves them. Members left out keep none. */
	roles?: Record<number, MemberRole>;
};

/** First of `memberUserIds` is the owner, the rest join like in production (within the non-patron team limit). */
export const { create } = defineFactory({
	defaults: ({ seq }) => ({
		name: `Team ${seq}`,
		isMainTeam: true,
	}),
	insert: async ({ memberUserIds, ...args }: InsertArgs) => {
		const [ownerUserId, ...otherMemberUserIds] = memberUserIds;
		invariant(ownerUserId, "A team needs at least an owner");

		const team = await TeamRepository.insert({ ...args, ownerUserId });

		for (const userId of otherMemberUserIds) {
			await actAs(userId, () =>
				TeamRepository.insertOwnMembership({
					teamId: team.id,
					maxTeamsAllowed: TEAM.MAX_TEAM_COUNT_NON_PATRON,
				}),
			);
		}

		return { ...team, name: args.name, ownerUserId, memberUserIds };
	},
	applyOptions: async (
		team,
		{ hasAvatar, avatarUrl, mapModePreferences, roles }: Options,
	) => {
		if (roles) {
			await TeamRepository.updateRoster({
				teamId: team.id,
				members: team.memberUserIds.map((userId, index) => ({
					userId,
					role: roles[userId] ?? null,
					customRole: null,
					roleType: null,
					isManager: false,
					order: index,
				})),
				kickedUserIds: [],
			});
		}

		if (mapModePreferences) {
			await TeamRepository.updateMapModePreferences({
				id: team.id,
				mapModePreferences,
			});
		}

		if (!hasAvatar && !avatarUrl) return;

		const image = await ImageFactory.create(
			avatarUrl
				? { submitterUserId: team.ownerUserId, url: avatarUrl }
				: { submitterUserId: team.ownerUserId },
			{ isValidated: true },
		);

		// the team edit page saves the whole profile at once; the rest is still empty on a fresh insert
		await TeamRepository.update({
			id: team.id,
			name: team.name,
			bio: null,
			bsky: null,
			tag: null,
			avatarImgId: image.id,
			bannerImgId: null,
		});
	},
});
