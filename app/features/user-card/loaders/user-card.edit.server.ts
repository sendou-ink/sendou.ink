import { requireUser } from "~/features/auth/core/user.server";
import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
import invariant from "~/utils/invariant";
import * as UserCardRepository from "../UserCardRepository.server";

export const loader = async () => {
	const user = requireUser();

	const [{ userCards }, extras, hasLinkedPlayer, verifiedPeakXp] =
		await Promise.all([
			UserCardRepository.userCards({
				userIds: [user.id],
				includeHiddenStats: true,
			}),
			UserCardRepository.cardEditExtras(user.id),
			XRankPlacementRepository.isPlayerLinkedByUserId(user.id),
			XRankPlacementRepository.peakVerifiedXpByUserId(user.id),
		]);

	const card = userCards.get(user.id);
	invariant(card, "card data not found for own user");

	return {
		card,
		extras,
		isSupporter: Boolean(user.roles?.includes("SUPPORTER")),
		presentStats: card.stats.map((stat) => stat.type),
		hasLinkedPlayer,
		verifiedPeakXp,
	};
};
