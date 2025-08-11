import { requireUser } from '$lib/server/auth/session';
import * as BuildRepository from '$lib/server/db/repositories/build';
import { error } from '@sveltejs/kit';

export async function requirePermissionsToManageBuild(buildId: number) {
	const user = await requireUser();
	const usersBuilds = await BuildRepository.allByUserId(user.id, {
		showPrivate: true,
		sortAbilities: false
	});

	const build = usersBuilds.find((build) => build.id === buildId);

	if (!build) error(400);

	return build;
}
