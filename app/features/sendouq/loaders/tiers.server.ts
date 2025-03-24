import { currentOrPreviousSeason } from "~/features/mmr/season";
import { userSkills } from "~/features/mmr/tiered.server";

export const loader = () => {
	const season = currentOrPreviousSeason(new Date());
	const { intervals } = userSkills(season!.nth);

	return {
		intervals,
	};
};
