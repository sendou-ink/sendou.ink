import type { LoaderFunctionArgs } from "@remix-run/node";
import { z } from "zod";
import { getUser } from "~/features/auth/core/user.server";
import { parseSafeSearchParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { eventLeaderboards } from "../core/leaderboards.server";
import { TOURNAMENT_SERIES_LEADERBOARD_SIZE } from "../tournament-organization-constants";
import { organizationFromParams } from "../tournament-organization-utils.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
	const user = await getUser(request);
	const {
		month = new Date().getMonth(),
		year = new Date().getFullYear(),
		page = 1,
		series: _seriesId,
		source,
	} = parseSafeSearchParams({
		request,
		schema: searchParamsSchema,
	}).data ?? {};

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
	};
}

const searchParamsSchema = z.object({
	month: z.coerce.number().int().min(0).max(11).optional(),
	year: z.coerce.number().int().min(2020).max(2100).optional(),
	series: id.optional(),
	page: z.coerce.number().int().min(1).max(100).optional(),
	source: z.string().optional(),
});

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
		established: events.at(-1)!.startTime,
	};
}
