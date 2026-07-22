import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import * as TrophyRepository from "../TrophyRepository.server";
import { TROPHY_APPROVALS_REQUIRED } from "../trophies-constants";
import { canReviewTrophies } from "../trophies-utils";

export type NewTrophyLoaderData = SerializeFrom<typeof loader>;

export const loader = async (_args: LoaderFunctionArgs) => {
	const user = requireUser();
	const canReview = canReviewTrophies(user);

	const [rawItems, ownUnreviewedCount, editableTrophies] = await Promise.all([
		canReview
			? TrophyRepository.allPending()
			: TrophyRepository.pendingBySubmitter(user.id),
		TrophyRepository.unreviewedCountBySubmitter(user.id),
		canReview
			? TrophyRepository.findAllForEditing()
			: TrophyRepository.findManagedBy(user.id),
	]);

	const allItems = canReview ? rawItems : rawItems.map(stripReviewerInfo);

	const isAccepted = (item: (typeof allItems)[number]) =>
		item.approvals.length >= TROPHY_APPROVALS_REQUIRED;

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
