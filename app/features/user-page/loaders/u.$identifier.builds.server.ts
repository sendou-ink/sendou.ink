import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { BUILDS_PAGE_SIZE } from "~/features/builds/builds-constants";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { userPageUserId } from "~/features/user-page/user-page-context.server";
import { notFound, notFoundIfNullish, paginate } from "~/utils/remix.server";
import { userBuildsSearchParams } from "../user-page-search-params";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const loggedInUser = getUser();
	const userId = userPageUserId();
	const isOwnPage = loggedInUser?.id === userId;

	const { page, abilities, mode, date, weapon, visibility } =
		userBuildsSearchParams.parse(url);

	const user = notFoundIfNullish(
		await UserRepository.findBuildFieldsByUserId(userId),
	);
	const counts = await BuildRepository.countsByUserId(userId, {
		showPrivate: isOwnPage,
	});

	if (counts.total === 0 && !isOwnPage) {
		notFound();
	}

	const { builds, totalCount } = await BuildRepository.findPageByUserId({
		userId,
		showPrivate: isOwnPage,
		filters: {
			abilities,
			mode,
			date,
			weaponId: weapon,
			// the filter only shows when there are private builds to tell apart
			visibility: counts.private > 0 ? visibility : null,
		},
		sorting: { buildSorting: user.buildSorting, weaponPool: user.weapons },
		page,
		sortAbilities:
			!isOwnPage && !loggedInUser?.preferences?.disableBuildAbilitySorting,
	});

	return {
		buildSorting: user.buildSorting,
		builds,
		filteredBuildsCount: totalCount,
		...paginate({ url, page, pageSize: BUILDS_PAGE_SIZE, totalCount }),
		counts,
	};
};
