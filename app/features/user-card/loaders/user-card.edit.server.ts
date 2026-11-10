import { requireUser } from "~/features/auth/core/user.server";
import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
import { invariant } from "~/utils/invariant";
import * as UserCardRepository from "../UserCardRepository.server";

export const loader = async () => {
	const user = requireUser();

	const { userCards } = await UserCardRepository.findAllByUserIds({
		userIds: [user.id],
		includeHiddenStats: true,
	});
	const extras = await UserCardRepository.findCardEditExtrasByUserId(user.id);
	const hasLinkedPlayer = await XRankPlacementRepository.isPlayerLinkedByUserId(
		user.id,
	);

	const card = userCards[user.id];
	invariant(card, "card data not found for own user");

	// the division the card settled on is what a self-reported peak XP is judged against
	const verifiedXp = await UserCardRepository.findVerifiedXpByUserId(
		user.id,
		extras.xpDivision,
	);

	return {
		card,
		extras,
		isSupporter: Boolean(user.roles?.includes("SUPPORTER")),
		presentStats: card.stats.map((stat) => stat.type),
		hasLinkedPlayer,
		verifiedPeakXp: verifiedXp?.points ?? null,
	};
};
