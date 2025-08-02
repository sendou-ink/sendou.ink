import { query } from '$app/server';
import { z } from 'zod/v4';
import { weaponIdFromSlug } from '../schemas';
import { cachedBuildsByWeaponId } from './cached-builds.server';
import { BUILDS_PAGE_MAX_BUILDS } from '$lib/constants/build';
import * as R from 'remeda';

export const buildsBySlug = query(
	z.object({
		slug: weaponIdFromSlug,
		limit: z
			.number()
			.int()
			.refine((value) => R.clamp(value, { min: 1, max: BUILDS_PAGE_MAX_BUILDS }))
	}),
	async ({ slug: weaponId, limit }) => {
		const cachedBuilds = cachedBuildsByWeaponId(weaponId);

		// xxx: add filtering
		// const filters = buildFiltersSearchParams.safeParse(rawFilters ?? "[]");

		// if (!filters.success) {
		// 	logger.error(
		// 		"Invalid filters",
		// 		JSON.stringify(filters.error.issues, null, 2),
		// 	);
		// }

		// const filteredBuilds =
		// 	filters.success && filters.data && filters.data.length > 0
		// 		? filterBuilds({
		// 				builds: cachedBuilds,
		// 				filters: filters.data,
		// 				count: args.limit,
		// 			})
		// 		: cachedBuilds.slice(0, args.limit);

		const filteredBuilds = cachedBuilds.slice(0, limit);

		return {
			builds: filteredBuilds,
			weaponId,
			hasMore: cachedBuilds.length > filteredBuilds.length
			// filters: filters.success ? filters.data : [],
		};
	}
);
