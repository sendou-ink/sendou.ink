import type { LoaderFunctionArgs } from "react-router";
import { refine } from "~/db/entity-query";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { getUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { queryToUserIdentifier } from "~/utils/users";
import { searchSearchParams } from "../search-search-params";
import type { SearchType } from "../search-types";

export type SearchLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		const user = getUser();
		if (!user) {
			return null;
		}
	}

	const { q: query, type, limit } = searchSearchParams.parse(request);

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
				? await exactUser(identifier).execute()
				: await UserRepository.search({ query, limit });
			return users.map((u) => ({
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
		}
		case "teams": {
			const teams = await teamsNamed(query, limit);
			return teams.map((t) => ({
				type: "team" as const,
				id: t.id,
				name: t.name,
				avatarUrl: t.avatarUrl,
				customUrl: t.customUrl,
				members: t.players,
			}));
		}
		case "organizations": {
			const numericQuery = /^\d+$/.test(query) ? Number(query) : null;
			const orgs = numericQuery
				? await TournamentOrganizationRepository.findOneById(numericQuery).then(
						(o) => (o ? [o] : []),
					)
				: await TournamentOrganizationRepository.searchByName({
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
				startsAt: t.startsAt,
			}));
		}
	}
}

function teamsNamed(query: string, limit: number) {
	return TeamRepository.teams()
		.nameContaining(query)
		.withPlayers()
		.limit(limit)
		.execute();
}

function exactUser(
	identifier: NonNullable<ReturnType<typeof queryToUserIdentifier>>,
) {
	return UserRepository.users()
		.where(identifier)
		.withPlusTier()
		.with(
			refine("User", (qb) =>
				qb.select(["User.inGameName", "User.tournamentName"]),
			),
		);
}
