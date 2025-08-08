import { command } from '$app/server';
import { id } from '$lib/schemas';
import { requireUser } from '$lib/server/auth/session';
import * as BuildRepository from '$lib/server/db/repositories/build';
import { error } from '@sveltejs/kit';
import { z } from 'zod/v4';
import { logger } from '$lib/utils/logger';
import { refreshBuildsCacheByWeaponSplIds } from '../../../builds/[slug]/cached-builds.server';

export const deleteBuild = command(id, async (buildId) => {
	const build = await requirePermissions(buildId);

	// xxx: error throwing during server actions should have some kind of toast to user
	// throw new Error('delete build!');

	await BuildRepository.deleteById(buildId);

	try {
		refreshBuildsCacheByWeaponSplIds(build.weapons.map((weapon) => weapon.weaponSplId));
	} catch (error) {
		logger.warn('Error refreshing builds cache', error);
	}
});

export const updateBuildVisibility = command(
	z.object({
		buildId: id,
		isPrivate: z.boolean()
	}),
	async (args) => {
		const build = await requirePermissions(args.buildId);

		await BuildRepository.updateVisibilityById({
			id: build.id,
			private: args.isPrivate ? 1 : 0
		});
	}
);

async function requirePermissions(buildId: number) {
	const user = await requireUser();
	const usersBuilds = await BuildRepository.allByUserId({
		userId: user.id,
		showPrivate: true
	});

	const build = usersBuilds.find((build) => build.id === buildId);

	if (!build) error(400);

	return build;
}
