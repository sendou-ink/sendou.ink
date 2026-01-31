import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import {
	validatedBuildFromSearchParams,
	validatedWeaponIdFromSearchParams,
} from "~/features/build-analyzer/core/utils";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import type { WeaponPoolItem } from "~/form/fields/WeaponPoolFormField";
import type { Ability } from "~/modules/in-game-lists/types";
import { actualNumber, id } from "~/utils/zod";
import type { newBuildBaseSchema } from "../user-page-schemas";

const newBuildLoaderParamsSchema = z.object({
	buildId: z.preprocess(actualNumber, id),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();
	const url = new URL(request.url);

	const params = newBuildLoaderParamsSchema.safeParse(
		Object.fromEntries(url.searchParams),
	);

	const usersBuilds = await BuildRepository.allByUserId(user.id, {
		showPrivate: true,
	});
	const buildToEdit = usersBuilds.find(
		(b) => params.success && b.id === params.data.buildId,
	);

	return {
		defaultValues: resolveDefaultValues(url.searchParams, buildToEdit),
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

type NewBuildDefaultValues = Partial<z.infer<typeof newBuildBaseSchema>>;

function resolveDefaultValues(
	searchParams: URLSearchParams,
	buildToEdit:
		| Awaited<ReturnType<typeof BuildRepository.allByUserId>>[number]
		| undefined,
): NewBuildDefaultValues | null {
	const weapons = resolveDefaultWeapons();
	const abilities =
		buildToEdit?.abilities ?? validatedBuildFromSearchParams(searchParams);

	if (!buildToEdit && weapons.length === 0 && !abilities) {
		return null;
	}

	return {
		buildToEditId: buildToEdit?.id,
		weapons,
		head: buildToEdit?.headGearSplId === -1 ? null : buildToEdit?.headGearSplId,
		clothes:
			buildToEdit?.clothesGearSplId === -1
				? null
				: buildToEdit?.clothesGearSplId,
		shoes:
			buildToEdit?.shoesGearSplId === -1 ? null : buildToEdit?.shoesGearSplId,
		abilities,
		title: buildToEdit?.title,
		description: buildToEdit?.description ?? null,
		modes: buildToEdit?.modes ?? [],
		private: Boolean(buildToEdit?.private),
	};

	function resolveDefaultWeapons(): WeaponPoolItem[] {
		if (buildToEdit) {
			return buildToEdit.weapons.map((wpn) => ({
				id: wpn.weaponSplId,
				isFavorite: false,
			}));
		}

		const weaponIdFromParams = validatedWeaponIdFromSearchParams(searchParams);
		if (weaponIdFromParams) {
			return [{ id: weaponIdFromParams, isFavorite: false }];
		}

		return [];
	}
}
