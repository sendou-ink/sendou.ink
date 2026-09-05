import { requireUser } from "~/features/auth/core/user.server";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";

export const loader = async () => {
	const user = requireUser();

	const currentWidgets = await UserRepository.findStoredWidgetsByUserId(
		user.id,
	);

	const badgesOwnedWidget = currentWidgets.find((w) => w.id === "badges-owned");
	const ownedBadges = await BadgeRepository.findByOwnerUserId(
		user.id,
		badgesOwnedWidget?.settings.favoriteBadgeIds ?? [],
	);

	return { currentWidgets, ownedBadges };
};
