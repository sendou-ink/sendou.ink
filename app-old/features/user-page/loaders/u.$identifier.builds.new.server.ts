import type { LoaderFunctionArgs } from "@remix-run/node";
import { z } from "zod";
import { requireUserId } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import type { Ability } from "~/modules/in-game-lists";
import { actualNumber, id } from "~/utils/zod";

const newBuildLoaderParamsSchema = z.object({
	buildId: z.preprocess(actualNumber, id),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);
	const url = new URL(request.url);

	const params = newBuildLoaderParamsSchema.safeParse(
		Object.fromEntries(url.searchParams),
	);

	const usersBuilds = await BuildRepository.allByUserId({
		userId: user.id,
		showPrivate: true,
	});
	const buildToEdit = usersBuilds.find(
		(b) => params.success && b.id === params.data.buildId,
	);

	return {
		buildToEdit,
		gearIdToAbilities: resolveGearIdToAbilities(),
	};

	function resolveGearIdToAbilities() {
		return usersBuilds.reduce(
			(acc, build) => {
				acc[`HEAD_${build.headGearSplId}`] = build.abilities[0];
				acc[`CLOTHES_${build.clothesGearSplId}`] = build.abilities[1];
				acc[`SHOES_${build.shoesGearSplId}`] = build.abilities[2];

				return acc;
			},
			{} as Record<string, [Ability, Ability, Ability, Ability]>,
		);
	}
};
