import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { getUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfFalsy, privatelyCachedJson } from "~/utils/remix.server";
import { sortBuilds } from "../core/build-sorting.server";
import { userParamsSchema } from "../user-page-schemas";

export type UserBuildsPageData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const loggedInUser = getUser();
	const { identifier } = userParamsSchema.parse(params);
	const user = notFoundIfFalsy(
		await UserRepository.identifierToBuildFields(identifier),
	);

	const builds = await BuildRepository.allByUserId(user.id, {
		showPrivate: loggedInUser?.id === user.id,
		sortAbilities:
			loggedInUser?.id !== user.id &&
			!loggedInUser?.preferences?.disableBuildAbilitySorting,
	});

	if (builds.length === 0 && loggedInUser?.id !== user.id) {
		throw new Response(null, { status: 404 });
	}

	const sortedBuilds = sortBuilds({
		builds,
		buildSorting: user.buildSorting,
		weaponPool: user.weapons,
	});

	return privatelyCachedJson({
		buildSorting: user.buildSorting,
		builds: sortedBuilds,
		weaponCounts: R.countBy(
			builds.flatMap((build) => build.weapons),
			(weapon) => weapon.weaponSplId,
		),
	});
};
