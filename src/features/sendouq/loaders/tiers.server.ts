import * as Seasons from "~/features/mmr/core/Seasons";
import { userSkills } from "~/features/mmr/tiered.server";

export const loader = () => {
	const season = Seasons.currentOrPrevious();
	const { intervals } = userSkills(season!.nth);

	return {
		intervals,
	};
};
