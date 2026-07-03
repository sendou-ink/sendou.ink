import { requireUser } from "~/features/auth/core/user.server";
import invariant from "~/utils/invariant";
import * as UserCardRepository from "../UserCardRepository.server";
import { maxUnverifiedXp } from "../user-card-utils";

export const loader = async () => {
	const user = requireUser();

	const [{ userCards }, extras] = await Promise.all([
		UserCardRepository.userCards({
			userIds: [user.id],
			includeHiddenStats: true,
		}),
		UserCardRepository.cardEditExtras(user.id),
	]);

	const card = userCards.get(user.id);
	invariant(card, "card data not found for own user");

	return {
		card,
		extras,
		isSupporter: Boolean(user.roles?.includes("SUPPORTER")),
		maxUnverifiedXp: maxUnverifiedXp(extras.linkedPlayerPeakXp),
		presentStats: card.stats.map((stat) => stat.type),
	};
};
