import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import { paginate } from "~/utils/remix.server";
import * as BuildRepository from "../BuildRepository.server";
import { BUILDS_PAGE_SIZE } from "../builds-constants";
import { buildsSearchParams } from "../builds-search-params";
import { weaponBuildsLayoutData } from "../core/weapon-builds-layout.server";

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	const user = getUser();
	const layout = await weaponBuildsLayoutData(params.slug);

	const { page, ...filters } = buildsSearchParams.parse(url);

	const { builds, ownerCount, buildCount } =
		await BuildRepository.findPageByWeaponId({
			weaponId: layout.weaponId,
			filters,
			page,
			sortAbilities: !user?.preferences?.disableBuildAbilitySorting,
		});

	return {
		...layout,
		builds,
		filteredBuildsCount: buildCount,
		...paginate({
			url,
			page,
			pageSize: BUILDS_PAGE_SIZE,
			totalCount: ownerCount,
		}),
	};
};
