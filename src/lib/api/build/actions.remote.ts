import * as BuildRepository from '$lib/server/db/repositories/build';
import { z } from 'zod/v4';
import { requirePermissionsToManageBuild } from './utils';
import { command } from '$app/server';
import { id } from '$lib/schemas';
import * as UserRepository from '$lib/server/db/repositories/user';
import invariant from '$lib/utils/invariant';
import { byUserIdentifier } from './queries.remote';
import { validatedForm } from '$lib/server/remote-functions';
import { updateBuildSortingSchema } from './schemas';

export const updateVisibilityById = command(
	z.object({
		buildId: id,
		isPrivate: z.boolean()
	}),
	async (args) => {
		const build = await requirePermissionsToManageBuild(args.buildId);

		const { ownerId } = await BuildRepository.updateVisibilityById({
			id: build.id,
			private: args.isPrivate
		});

		await refreshBuildsPageQuery(ownerId);
	}
);

export const deleteById = command(id, async (buildId) => {
	await requirePermissionsToManageBuild(buildId);

	// xxx: error throwing during server actions should have some kind of toast to user
	// throw new Error('delete build!');

	const { ownerId } = await BuildRepository.deleteById(buildId);

	await refreshBuildsPageQuery(ownerId);
});

export const updateBuildSorting = validatedForm(updateBuildSortingSchema, async (data, user) => {
	await UserRepository.updateBuildSorting({
		userId: user.id,
		buildSorting: data.buildSorting ?? null
	});

	await refreshBuildsPageQuery(user.id);
});

async function refreshBuildsPageQuery(userId: number) {
	const data = await UserRepository.findLayoutDataByIdentifier(String(userId));
	invariant(data, 'User not found');

	const identifier = data.user.customUrl ?? data.user.discordId;

	await byUserIdentifier(identifier).refresh();
}
