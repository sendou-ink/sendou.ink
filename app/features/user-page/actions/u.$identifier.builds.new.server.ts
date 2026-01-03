import { type ActionFunction, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import type { BuildAbilitiesTuple } from "~/modules/in-game-lists/types";
import { parseRequestPayload } from "~/utils/remix.server";
import { userBuildsPage } from "~/utils/urls";
import { newBuildSchema } from "../user-page-schemas";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: newBuildSchema,
	});

	const commonArgs = {
		title: data.title,
		description: data.description,
		abilities: data.abilities as BuildAbilitiesTuple,
		headGearSplId: data.head,
		clothesGearSplId: data.clothes,
		shoesGearSplId: data.shoes,
		modes: data.modes,
		weaponSplIds: data.weapons.map((w) => w.id),
		ownerId: user.id,
		private: data.private ? 1 : 0,
	};

	if (data.buildToEditId) {
		await BuildRepository.update({ id: data.buildToEditId, ...commonArgs });
	} else {
		await BuildRepository.create(commonArgs);
	}

	return redirect(userBuildsPage(user));
};
