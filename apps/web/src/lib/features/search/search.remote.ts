import * as v from "valibot";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "#lib/features/admin/dev-controls.server.ts";
import { getUser } from "#lib/features/auth/user.server.ts";
import * as UserRepository from "#lib/features/user-page/UserRepository.server.ts";
import { queryToUserIdentifier } from "#lib/utils/users.ts";
import { query } from "$app/server";

export const searchUsers = query(
	v.object({
		q: v.string(),
		limit: v.optional(
			v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(25)),
			6,
		),
	}),
	async ({ q, limit }) => {
		if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS && !getUser()) {
			return { results: [], query: q };
		}

		if (!q) return { results: [], query: q };

		const identifier = queryToUserIdentifier(q);
		const users = identifier
			? await UserRepository.searchExact(identifier)
			: await UserRepository.search({ query: q, limit });

		const results = users.map((u) => ({
			type: "user" as const,
			id: u.id,
			name: u.username,
			inGameName: u.inGameName,
			tournamentName: u.tournamentName,
			avatarUrl: null,
			discordId: u.discordId,
			discordAvatar: u.discordAvatar,
			customUrl: u.customUrl,
			plusTier: u.plusTier,
		}));

		return { results, query: q };
	},
);

export type UserSearchResult = Awaited<
	ReturnType<typeof searchUsers>
>["results"][number];
