import { command } from '$app/server';
import { id } from '$lib/schemas';
import { requireUser } from '$lib/server/auth/session';
import * as BuildRepository from '$lib/server/db/repositories/build';
import { error } from '@sveltejs/kit';
import { userBuilds } from './user-builds.remote';
import { z } from 'zod/v4';
import { userLayoutData } from '../user-layout-data.remote';
import { logger } from '$lib/utils/logger';
import { refreshBuildsCacheByWeaponSplIds } from '../../../builds/[slug]/cached-builds.server';

export const deleteBuild = command(
	z.object({
		buildId: id,
		identifier: z.string()
	}),
	async (args) => {
		const user = await requireUser();
		const usersBuilds = await BuildRepository.allByUserId({
			userId: user.id,
			showPrivate: true
		});

		const buildToDelete = usersBuilds.find((build) => build.id === args.buildId);

		if (!buildToDelete) error(400);

		await BuildRepository.deleteById(args.buildId);

		try {
			refreshBuildsCacheByWeaponSplIds(buildToDelete.weapons.map((weapon) => weapon.weaponSplId));
		} catch (error) {
			logger.warn('Error refreshing builds cache', error);
		}

		await userLayoutData(args.identifier).refresh();
	}
);
