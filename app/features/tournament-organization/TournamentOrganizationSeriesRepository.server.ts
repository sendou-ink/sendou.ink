import { crud } from "~/db/crud";
import { defineQuery, refine } from "~/db/entity-query";
import {
	type TournamentTierNumber,
	updateTierHistory,
} from "~/features/tournament/core/tiering";

// its own repository rather than part of TournamentOrganizationRepository: the tentative tiers cache
// reads series while its module loads, and that repository imports the auth modules, which import it back
const seriesTable = crud("TournamentOrganizationSeries");

// the edit form allows 10 series, organizations from before the limit may have more
const SERIES_PER_ORGANIZATION_LIMIT = 100;

/** Tournament series, each matching the events of its organization whose name contains one of its `substringMatches`. */
export const series = defineQuery({
	root: "TournamentOrganizationSeries",
	select: (qb) =>
		qb.select([
			"TournamentOrganizationSeries.id",
			"TournamentOrganizationSeries.name",
			"TournamentOrganizationSeries.organizationId",
			"TournamentOrganizationSeries.substringMatches",
		]),
	defaultSort: [["TournamentOrganizationSeries.id", "asc"]],
	vocabulary: () => ({
		ofOrganizations: (organizationIds: ReadonlyArray<number>) =>
			refine("TournamentOrganizationSeries", (qb) =>
				qb.where(
					"TournamentOrganizationSeries.organizationId",
					"in",
					organizationIds,
				),
			),
	}),
});

/** Adds the tier to the history of the organization's series whose name the event's matches. */
export async function updateSeriesTierHistory({
	organizationId,
	eventName,
	newTier,
}: {
	organizationId: number;
	eventName: string;
	newTier: TournamentTierNumber;
}) {
	const organizationSeries = await seriesTable.findManyBy(
		{ organizationId },
		{ limit: SERIES_PER_ORGANIZATION_LIMIT },
	);

	const eventNameLower = eventName.toLowerCase();
	const matchingSeries = organizationSeries.find((s) =>
		s.substringMatches.some((match) =>
			eventNameLower.includes(match.toLowerCase()),
		),
	);

	if (!matchingSeries) return;

	await seriesTable.updateById(matchingSeries.id, {
		tierHistory: updateTierHistory(matchingSeries.tierHistory, newTier),
	});
}
