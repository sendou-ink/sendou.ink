import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import * as TrophyRepository from "../TrophyRepository.server";
import { canReviewTrophies } from "../trophies-utils";

export type NewTrophyLoaderData = SerializeFrom<typeof loader>;

export const loader = async (_args: LoaderFunctionArgs) => {
	const user = requireUser();
	const canReview = canReviewTrophies(user);

	const [rawItems, ownUnreviewedCount] = await Promise.all([
		canReview
			? TrophyRepository.allPending()
			: TrophyRepository.pendingBySubmitter(user.id),
		TrophyRepository.unreviewedCountBySubmitter(user.id),
	]);

	const allItems = canReview ? rawItems : rawItems.map(stripReviewerInfo);

	const pendingTrophies = allItems.filter(
		(item) => !item.acceptedAt && !item.declinedAt,
	);
	const reviewedTrophies = allItems.filter(
		(item) => item.acceptedAt || item.declinedAt,
	);

	return {
		canReview,
		currentUserId: user.id,
		ownUnreviewedCount,
		pendingTrophies,
		reviewedTrophies,
	};
};

function stripReviewerInfo(
	item: Awaited<ReturnType<typeof TrophyRepository.allPending>>[number],
) {
	return {
		...item,
		acceptedByUserId: null,
		acceptedByUsername: null,
		declinedByUserId: null,
		declinedByUsername: null,
	};
}
