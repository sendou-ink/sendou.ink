import * as TeamRepository from "~/features/team/TeamRepository.server";
import { TEAM } from "~/features/team/team-constants";
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
};

/**
 * Creates teams. The first of `memberUserIds` is the owner, whose membership the
 * repository creates with the team; the rest join it the way they do in production,
 * within the team count a non-patron is allowed. Custom url and invite code are the
 * repository's own, the custom url following from the name.
 */
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
	applyOptions: async (team, { hasAvatar, avatarUrl }: Options) => {
		if (!hasAvatar && !avatarUrl) return;

		const image = await ImageFactory.create(
			avatarUrl
				? { submitterUserId: team.ownerUserId, url: avatarUrl }
				: { submitterUserId: team.ownerUserId },
			{ isValidated: true },
		);

		// the team edit page saves the whole profile at once; everything besides the
		// name is still empty on a team the repository has only just inserted
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
