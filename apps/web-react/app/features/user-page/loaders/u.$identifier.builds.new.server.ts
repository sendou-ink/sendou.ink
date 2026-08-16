import type { LoaderFunctionArgs } from "react-router";
import type { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import type { WeaponPoolItem } from "~/form/fields/WeaponPoolFormField";
import type { Ability, MainWeaponId } from "~/modules/in-game-lists/types";
import type { SearchParamsValues } from "~/modules/search-params/search-params";
import type { newBuildBaseSchema } from "../user-page-schemas";
import { userBuildsNewSearchParams } from "../user-page-search-params";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const user = requireUser();

	const params = userBuildsNewSearchParams.parse(url);

	const usersBuilds = await BuildRepository.findAllByUserId(user.id, {
		showPrivate: true,
	});
	const buildToEdit = usersBuilds.find((b) => b.id === params.buildId);

	return {
		defaultValues: resolveDefaultValues(params, buildToEdit),
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
	params: SearchParamsValues<typeof userBuildsNewSearchParams.shape>,
	buildToEdit:
		| Awaited<ReturnType<typeof BuildRepository.findAllByUserId>>[number]
		| undefined,
): NewBuildDefaultValues | null {
	const weapons = resolveDefaultWeapons();
	const abilities = buildToEdit?.abilities ?? params.build;

	if (!buildToEdit && weapons.length === 0 && !abilities) {
		return null;
	}

	return {
		buildToEditId: buildToEdit?.id,
		weapons,
		head: buildToEdit?.headGearSplId,
		clothes: buildToEdit?.clothesGearSplId,
		shoes: buildToEdit?.shoesGearSplId,
		abilities,
		title: buildToEdit?.title,
		description: buildToEdit?.description ?? null,
		modes: buildToEdit?.modes ?? [],
		isPrivate: Boolean(buildToEdit?.isPrivate),
	};

	function resolveDefaultWeapons(): WeaponPoolItem[] {
		if (buildToEdit) {
			return buildToEdit.weapons.map((wpn) => ({
				id: wpn.weaponSplId,
				isFavorite: false,
			}));
		}

		if (typeof params.weapon === "number") {
			return [{ id: params.weapon as MainWeaponId, isFavorite: false }];
		}

		return [];
	}
}
