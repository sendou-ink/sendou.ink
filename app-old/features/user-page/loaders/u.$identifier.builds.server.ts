import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUserId } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { sortAbilities } from "~/features/builds/core/ability-sorting.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { MainWeaponId } from "~/modules/in-game-lists";
import { notFoundIfFalsy, privatelyCachedJson } from "~/utils/remix.server";
import { sortBuilds } from "../core/build-sorting.server";
import { userParamsSchema } from "../user-page-schemas.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const loggedInUser = await getUserId(request);
	const { identifier } = userParamsSchema.parse(params);
	const user = notFoundIfFalsy(
		await UserRepository.identifierToBuildFields(identifier),
	);

	const builds = await BuildRepository.allByUserId({
		userId: user.id,
		showPrivate: loggedInUser?.id === user.id,
	});

	if (builds.length === 0 && loggedInUser?.id !== user.id) {
		throw new Response(null, { status: 404 });
	}

	const sortedBuilds = sortBuilds({
		builds,
		buildSorting: user.buildSorting,
		weaponPool: user.weapons,
	}).map((build) => ({
		...build,
		abilities: sortAbilities(build.abilities),
		unsortedAbilities: build.abilities,
	}));

	return privatelyCachedJson({
		buildSorting: user.buildSorting,
		builds: sortedBuilds,
		weaponCounts: calculateWeaponCounts(),
	});

	function calculateWeaponCounts() {
		return builds.reduce(
			(acc, build) => {
				for (const weapon of build.weapons) {
					acc[weapon.weaponSplId] = (acc[weapon.weaponSplId] ?? 0) + 1;
				}

				return acc;
			},
			{} as Record<MainWeaponId, number>,
		);
	}
};
