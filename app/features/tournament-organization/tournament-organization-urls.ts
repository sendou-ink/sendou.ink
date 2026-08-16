import { tournamentOrganizationSearchParams } from "./tournament-organization-search-params";

export const tournamentOrganizationPage = ({
	organizationSlug,
	tournamentName,
}: {
	organizationSlug: string;
	tournamentName?: string;
}) =>
	tournamentOrganizationSearchParams.href(`/org/${organizationSlug}`, {
		source: tournamentName ?? null,
	});

export const tournamentOrganizationEditPage = (organizationSlug: string) =>
	`${tournamentOrganizationPage({ organizationSlug })}/edit`;

export const tournamentOrganizationStatsPage = (organizationSlug: string) =>
	`${tournamentOrganizationPage({ organizationSlug })}/stats`;
