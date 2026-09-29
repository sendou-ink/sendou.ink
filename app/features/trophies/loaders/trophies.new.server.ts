import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import { hasPermission } from "~/modules/permissions/utils";
import type { SerializeFrom } from "~/utils/remix";
import * as TrophyRepository from "../TrophyRepository.server";
import { canReviewTrophies } from "../trophies-utils";

export type NewTrophyLoaderData = SerializeFrom<typeof loader>;

export const loader = async (_args: LoaderFunctionArgs) => {
	const user = requireUser();

	const canReview = canReviewTrophies(user);

	const [rawItems, ownUnreviewedCount, trophies] = await Promise.all([
		canReview
			? TrophyRepository.allPending()
			: TrophyRepository.pendingBySubmitter(user.id),
		TrophyRepository.unreviewedCountBySubmitter(user.id),
		TrophyRepository.findAllForEditing(),
	]);

	const editableTrophies = trophies.filter((trophy) =>
		hasPermission(trophy, "EDIT", user),
	);

	const backfillSeries = (
		await TournamentOrganizationRepository.findAllSeriesByOrganizationIds(
			R.unique(
				editableTrophies.flatMap((trophy) =>
					trophy.organizationId ? [trophy.organizationId] : [],
				),
			),
		)
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
		backfillSeries,
	};
};

function stripReviewerInfo(
	item: Awaited<ReturnType<typeof TrophyRepository.allPending>>[number],
) {
	return {
		...item,
		approvals: item.approvals.map(() => ({
			userId: null as number | null,
			username: null as string | null,
			createdAt: 0,
		})),
		declinedByUserId: null,
		declinedByUsername: null,
	};
}
