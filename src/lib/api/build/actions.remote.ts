import * as BuildRepository from '$lib/server/db/repositories/build';
import { z } from 'zod/v4';
import { requirePermissionsToManageBuild } from './utils';
import { command } from '$app/server';
import { id } from '$lib/schemas';
import { logger } from '$lib/utils/logger';
import { refreshBuildsCacheByWeaponSplIds } from '../../../routes/builds/[slug]/cached-builds.server';

export const updateVisibilityById = command(
	z.object({
		buildId: id,
		isPrivate: z.boolean()
	}),
	async (args) => {
		const build = await requirePermissionsToManageBuild(args.buildId);

		await BuildRepository.updateVisibilityById({
			id: build.id,
			private: args.isPrivate ? 1 : 0
		});
	}
);

export const deleteById = command(id, async (buildId) => {
	const build = await requirePermissionsToManageBuild(buildId);

	// xxx: error throwing during server actions should have some kind of toast to user
	// throw new Error('delete build!');

	await BuildRepository.deleteById(buildId);

	try {
		refreshBuildsCacheByWeaponSplIds(build.weapons.map((weapon) => weapon.weaponSplId));
	} catch (error) {
		logger.warn('Error refreshing builds cache', error);
	}
});
