import * as R from "remeda";
import { getUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { userPageUserId } from "~/features/user-page/user-page-context.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish } from "~/utils/remix.server";
import { sortBuilds } from "../core/build-sorting.server";

export type UserBuildsPageData = SerializeFrom<typeof loader>;

export const loader = async () => {
	const loggedInUser = getUser();
	const userId = userPageUserId();
	const user = notFoundIfNullish(
		await UserRepository.findBuildFieldsByUserId(userId),
	);

	const builds = await BuildRepository.findAllByUserId(userId, {
		showPrivate: loggedInUser?.id === userId,
		sortAbilities:
			loggedInUser?.id !== userId &&
			!loggedInUser?.preferences?.disableBuildAbilitySorting,
	});

	if (builds.length === 0 && loggedInUser?.id !== userId) {
		throw new Response(null, { status: 404 });
	}

	const sortedBuilds = sortBuilds({
		builds,
		buildSorting: user.buildSorting,
		weaponPool: user.weapons,
	});

	return {
		buildSorting: user.buildSorting,
		builds: sortedBuilds,
		weaponCounts: R.countBy(
			builds.flatMap((build) => build.weapons),
			(weapon) => weapon.weaponSplId,
		),
	};
};
