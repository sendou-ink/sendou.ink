import { type ActionFunction, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { parseFormData } from "~/form/parse.server";
import type { BuildAbilitiesTuple } from "~/modules/in-game-lists/types";
import { userBuildsPage } from "~/utils/urls";
import { newBuildSchemaServer } from "../user-page-schemas.server";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();
	const result = await parseFormData({
		request,
		schema: newBuildSchemaServer,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const commonArgs = {
		title: result.data.title,
		description: result.data.description,
		abilities: result.data.abilities as BuildAbilitiesTuple,
		headGearSplId: result.data.head,
		clothesGearSplId: result.data.clothes,
		shoesGearSplId: result.data.shoes,
		modes: result.data.modes,
		weaponSplIds: result.data.weapons.map((w) => w.id),
		ownerId: user.id,
		private: result.data.private ? 1 : 0,
	};

	if (result.data.buildToEditId) {
		await BuildRepository.update({
			id: result.data.buildToEditId,
			...commonArgs,
		});
	} else {
		await BuildRepository.create(commonArgs);
	}

	return redirect(userBuildsPage(user));
};
