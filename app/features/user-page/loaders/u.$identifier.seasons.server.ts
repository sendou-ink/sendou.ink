import type { LoaderFunctionArgs } from "@remix-run/node";
import { seasonAllMMRByUserId } from "~/features/mmr/queries/seasonAllMMRByUserId.server";
import { currentOrPreviousSeason } from "~/features/mmr/season";
import { userSkills as _userSkills } from "~/features/mmr/tiered.server";
import { seasonMapWinrateByUserId } from "~/features/sendouq/queries/seasonMapWinrateByUserId.server";
import {
	seasonMatchesByUserId,
	seasonMatchesByUserIdPagesCount,
} from "~/features/sendouq/queries/seasonMatchesByUserId.server";
import { seasonReportedWeaponsByUserId } from "~/features/sendouq/queries/seasonReportedWeaponsByUserId.server";
import { seasonSetWinrateByUserId } from "~/features/sendouq/queries/seasonSetWinrateByUserId.server";
import { seasonStagesByUserId } from "~/features/sendouq/queries/seasonStagesByUserId.server";
import { seasonsMatesEnemiesByUserId } from "~/features/sendouq/queries/seasonsMatesEnemiesByUserId.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import {
	seasonsSearchParamsSchema,
	userParamsSchema,
} from "../user-page-schemas.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const { identifier } = userParamsSchema.parse(params);
	const parsedSearchParams = seasonsSearchParamsSchema.safeParse(
		Object.fromEntries(new URL(request.url).searchParams),
	);
	const {
		info = "weapons",
		page = 1,
		season = currentOrPreviousSeason(new Date())!.nth,
	} = parsedSearchParams.success ? parsedSearchParams.data : {};

	const user = notFoundIfFalsy(
		await UserRepository.identifierToUserId(identifier),
	);

	const { isAccurateTiers, userSkills } = _userSkills(season);
	const { tier, ordinal, approximate } = userSkills[user.id] ?? {
		approximate: false,
		ordinal: 0,
		tier: { isPlus: false, name: "IRON" },
	};

	return {
		currentOrdinal: !approximate ? ordinal : undefined,
		winrates: {
			maps: seasonMapWinrateByUserId({ season, userId: user.id }),
			sets: seasonSetWinrateByUserId({ season, userId: user.id }),
		},
		skills: seasonAllMMRByUserId({ season, userId: user.id }),
		tier,
		isAccurateTiers,
		matches: {
			value: seasonMatchesByUserId({ season, userId: user.id, page }),
			currentPage: page,
			pages: seasonMatchesByUserIdPagesCount({ season, userId: user.id }),
		},
		season,
		info: {
			currentTab: info,
			stages:
				info === "stages"
					? seasonStagesByUserId({ season, userId: user.id })
					: null,
			weapons:
				info === "weapons"
					? seasonReportedWeaponsByUserId({ season, userId: user.id })
					: null,
			players:
				info === "enemies" || info === "mates"
					? seasonsMatesEnemiesByUserId({
							season,
							userId: user.id,
							type: info === "enemies" ? "ENEMY" : "MATE",
						})
					: null,
		},
	};
};
