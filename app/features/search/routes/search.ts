import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseSearchParams } from "~/utils/remix.server";
import { queryToUserIdentifier } from "~/utils/users";
import { searchParamsSchema } from "../search-schemas";
import type { SearchType } from "../search-types";

export type SearchLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = getUser();
	if (!user) {
		return null;
	}

	const {
		q: query,
		type,
		limit,
	} = parseSearchParams({
		request,
		schema: searchParamsSchema,
	});

	if (!query) return { results: [], query, type };

	const results = await searchByType({ query, type, limit });

	return { results, query, type };
};

async function searchByType({
	query,
	type,
	limit,
}: {
	query: string;
	type: SearchType;
	limit: number;
}) {
	switch (type) {
		case "users": {
			const identifier = queryToUserIdentifier(query);
			const users = identifier
				? await UserRepository.searchExact(identifier)
				: await UserRepository.search({ query, limit });
			return users.map((u) => ({
				type: "user" as const,
				id: u.id,
				name: u.username,
				secondaryName: u.inGameName,
				avatarUrl: null,
				discordId: u.discordId,
				discordAvatar: u.discordAvatar,
				customUrl: u.customUrl,
			}));
		}
		case "teams": {
			const teams = await TeamRepository.searchByName({ query, limit });
			return teams.map((t) => ({
				type: "team" as const,
				name: t.name,
				avatarUrl: t.avatarUrl,
				customUrl: t.customUrl,
			}));
		}
		case "organizations": {
			const orgs = await TournamentOrganizationRepository.searchByName({
				query,
				limit,
			});
			return orgs.map((o) => ({
				type: "organization" as const,
				id: o.id,
				name: o.name,
				avatarUrl: o.avatarUrl,
				slug: o.slug,
			}));
		}
		case "tournaments": {
			const tournaments = await TournamentRepository.searchByName({
				query,
				limit,
			});
			return tournaments.map((t) => ({
				type: "tournament" as const,
				id: t.id,
				name: t.name,
				logoUrl: t.logoUrl,
				startTime: t.startTime,
			}));
		}
	}
}
