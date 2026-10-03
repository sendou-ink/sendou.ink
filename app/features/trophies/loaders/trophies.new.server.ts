import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import type { QueryRow } from "~/db/entity-query";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentOrganizationSeriesRepository from "~/features/tournament-organization/TournamentOrganizationSeriesRepository.server";
import { hasPermission } from "~/modules/permissions/utils";
import type { SerializeFrom } from "~/utils/remix";
import * as TrophyRepository from "../TrophyRepository.server";
import { canBackfillTrophies, canReviewTrophies } from "../trophies-utils";

export type NewTrophyLoaderData = SerializeFrom<typeof loader>;

export const loader = async (_args: LoaderFunctionArgs) => {
	const user = requireUser();

	const canReview = canReviewTrophies(user);
	const canBackfill = canBackfillTrophies(user);

	const rawItems = await submissions(canReview ? undefined : user.id).execute();
	const ownUnreviewedCount =
		await TrophyRepository.countUnreviewedBySubmitterUserId(user.id);
	const trophies = await tournamentTrophies().execute();

	const editableTrophies = trophies.filter((trophy) =>
		hasPermission(trophy, "EDIT", user),
	);

	const backfillTrophies = canBackfill ? trophies : [];
	const backfillSeries = (
		await TournamentOrganizationSeriesRepository.series()
			.ofOrganizations(
				R.unique(
					backfillTrophies.flatMap((trophy) =>
						trophy.organizationId ? [trophy.organizationId] : [],
					),
				),
			)
			.execute()
	).map(({ id, name, organizationId }) => ({ id, name, organizationId }));

	const allItems = canReview ? rawItems : rawItems.map(stripReviewerInfo);

	const isAccepted = (item: (typeof allItems)[number]) =>
		item.acceptedAt !== null;

	const pendingTrophies = allItems.filter(
		(item) => !isAccepted(item) && !item.declinedAt,
	);
	const reviewedTrophies = allItems.filter(
		(item) => isAccepted(item) || item.declinedAt,
	);

	return {
		canReview,
		currentUserId: user.id,
		ownUnreviewedCount,
		pendingTrophies,
		reviewedTrophies,
		editableTrophies,
		backfillTrophies,
		backfillSeries,
	};
};

function stripReviewerInfo(item: QueryRow<ReturnType<typeof submissions>>) {
	return {
		...item,
		approvals: item.approvals.map(() => ({
			userId: null as number | null,
			username: null as string | null,
		})),
		decliner: null,
	};
}

function submissions(submitterUserId: number | undefined) {
	return TrophyRepository.submissions()
		.where({ submitterUserId })
		.withSubmitter()
		.withDecliner()
		.withManager()
		.withCreator()
		.withOrganization()
		.withApprovals()
		.withTarget();
}

function tournamentTrophies() {
	return TrophyRepository.trophies()
		.where({ code: null })
		.withColumns(["organizationId", "managerId", "creatorId"])
		.withEditPermissions();
}
