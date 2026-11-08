import * as R from "remeda";
import * as BadgeRepository from "../BadgeRepository.server";

/**
 * Badges an editor can attach: the ones any of `managerIds` manage plus those already attached,
 * so an attached badge they no longer manage still renders and stays removable.
 */
export async function attachable<T extends { id: number }>({
	managerIds,
	attached,
}: {
	managerIds: number[];
	attached: T[];
}) {
	const managed = await BadgeRepository.findByManagersList(managerIds);

	return R.uniqueBy([...managed, ...attached], (badge) => badge.id);
}
