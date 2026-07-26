import * as Seasons from "~/features/mmr/core/Seasons";
import { userSkills } from "~/features/mmr/tiered.server";

export const loader = async () => {
	const season = Seasons.currentOrPrevious();
	const { intervals } = await userSkills(season!.nth);

	return {
		intervals,
	};
};
