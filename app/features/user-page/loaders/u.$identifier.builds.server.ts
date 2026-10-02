import * as R from "remeda";
import { refine } from "~/db/entity-query";
import { getUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { userPageUserId } from "~/features/user-page/user-page-context.server";
import { jsonArrayFrom } from "~/utils/kysely.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish } from "~/utils/remix.server";
import { sortBuilds } from "../core/build-sorting.server";

export type UserBuildsPageData = SerializeFrom<typeof loader>;

export const loader = async () => {
	const loggedInUser = getUser();
	const userId = userPageUserId();
	const user = notFoundIfNullish(await buildFields(userId).executeTakeFirst());

	const builds = await userBuilds(userId).execute();

	// xxx: some common way to do this
	if (builds.length === 0 && loggedInUser?.id !== userId) {
		throw new Response(null, { status: 404 });
	}

	const sortedBuilds = sortBuilds({
		builds,
		buildSorting: user.buildSorting,
		weaponPool: user.weapons.map((weapon) => weapon.weaponSplId),
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

function userBuilds(userId: number) {
	return BuildRepository.builds()
		.where({ ownerId: userId })
		.visibleToActor()
		.newestFirst() // xxx: or should we inline sortBuilds in the repository?
		.sortAbilitiesIfPreferred()
		.withEditPermissions();
}

function buildFields(userId: number) {
	return UserRepository.users()
		.where({ id: userId })
		.with(
			refine("User", (qb) =>
				qb.select((eb) => [
					"User.buildSorting",
					jsonArrayFrom(
						eb
							.selectFrom("UserWeaponPool")
							.select("UserWeaponPool.weaponSplId")
							.whereRef("UserWeaponPool.userId", "=", "User.id")
							.orderBy("UserWeaponPool.sortOrder", "asc"),
					).as("weapons"),
				]),
			),
		);
}
