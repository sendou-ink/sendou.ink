import { query } from '$app/server';
import { z } from 'zod/v4';
import { buildFiltersSearchParams, weaponIdFromSlug } from '../schemas';
import { cachedBuildsByWeaponId } from './cached-builds.server';
import { BUILDS_PAGE_MAX_BUILDS } from '$lib/constants/build';
import * as R from 'remeda';
import { filterBuilds } from '$lib/core/build/filter';

export const buildsBySlug = query(
	z.object({
		slug: weaponIdFromSlug,
		limit: z
			.number()
			.int()
			.refine((value) => R.clamp(value, { min: 1, max: BUILDS_PAGE_MAX_BUILDS })),
		filters: buildFiltersSearchParams.catch([])
	}),
	async ({ slug: weaponId, limit, filters }) => {
		const cachedBuilds = cachedBuildsByWeaponId(weaponId);

		const filteredBuilds =
			filters.length > 0
				? filterBuilds({
						builds: cachedBuilds,
						filters,
						count: limit
					})
				: cachedBuilds.slice(0, limit);

		return {
			builds: filteredBuilds,
			weaponId,
			hasMore: cachedBuilds.length > filteredBuilds.length
			// filters: filters.success ? filters.data : [],
		};
	}
);
