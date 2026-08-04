import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import { calculateTentativeTier } from "~/features/tournament/core/tiering";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import { canAccessTrophies } from "~/features/trophies/trophies-utils";
import type { SerializeFrom } from "~/utils/remix";
import { eventLeaderboards } from "../core/leaderboards.server";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { TOURNAMENT_SERIES_LEADERBOARD_SIZE } from "../tournament-organization-constants";
import { tournamentOrganizationSearchParams } from "../tournament-organization-search-params";
import { organizationFromParams } from "../tournament-organization-utils.server";

export type OrganizationPageLoaderData = SerializeFrom<typeof loader>;

export async function loader({ params, request }: LoaderFunctionArgs) {
	const user = getUser();
	const {
		month: monthParam,
		year: yearParam,
		page,
		series: _seriesId,
		source,
	} = tournamentOrganizationSearchParams.parse(request);
	const month = monthParam ?? new Date().getMonth();
	const year = yearParam ?? new Date().getFullYear();

	const organization = await organizationFromParams(params);

	const seriesId =
		_seriesId ??
		organization.series.find((s) =>
			s.substringMatches.some((match) => source?.toLowerCase().includes(match)),
		)?.id;

	const seriesInfo = async () => {
		const series = seriesId
			? organization.series.find((s) => s.id === seriesId)
			: null;

		if (!series) return null;

		const { leaderboard, ...rest } =
			(await seriesStuff({
				organizationId: organization.id,
				series,
				userId: user?.id,
			})) ?? {};

		return {
			id: series.id,
			name: series.name,
			description: series.description,
			page,
			leaderboard: series.showLeaderboard ? leaderboard : null,
			tentativeTier: series.tierHistory
				? calculateTentativeTier(series.tierHistory)
				: null,
			...rest,
		};
	};

	const series = seriesId
		? organization.series.find((s) => s.id === seriesId)
		: null;

	return {
		organization,
		events: series
			? await TournamentOrganizationRepository.findPaginatedEventsBySeries({
					organizationId: organization.id,
					substringMatches: series.substringMatches,
					page,
				})
			: await TournamentOrganizationRepository.findEventsByMonth({
					month,
					year,
					organizationId: organization.id,
				}),
		series: await seriesInfo(),
		month,
		year,
		trophies: canAccessTrophies(user)
			? await TrophyRepository.findByOrganizationId(organization.id)
			: [],
		bannedUsers:
			user?.id && organization.permissions.BAN.includes(user.id)
				? await TournamentOrganizationRepository.findAllBannedUsersByOrganizationId(
						organization.id,
					)
				: null,
	};
}

async function seriesStuff({
	organizationId,
	series,
	userId,
}: {
	organizationId: number;
	series: NonNullable<
		Awaited<ReturnType<typeof TournamentOrganizationRepository.findBySlug>>
	>["series"][number];
	userId?: number;
}) {
	const events = await TournamentOrganizationRepository.findAllEventsBySeries({
		organizationId,
		substringMatches: series.substringMatches,
	});

	if (events.length === 0) return null;

	const fullLeaderboard = await eventLeaderboards(events);
	const leaderboard = fullLeaderboard.slice(
		0,
		TOURNAMENT_SERIES_LEADERBOARD_SIZE,
	);

	const ownEntryIdx =
		userId && !leaderboard.some((entry) => entry.user.id === userId)
			? fullLeaderboard.findIndex((entry) => entry.user.id === userId)
			: -1;

	return {
		leaderboard,
		ownEntry:
			ownEntryIdx !== -1
				? {
						entry: fullLeaderboard[ownEntryIdx],
						placement: ownEntryIdx + 1,
					}
				: null,
		eventsCount: events.length,
		logoUrl: events[0].logoUrl,
		established: events.at(-1)!.startsAt,
	};
}
