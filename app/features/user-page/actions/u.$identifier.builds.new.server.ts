import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { defineAction } from "~/form/define-action.server";
import type { BuildAbilitiesTuple } from "~/modules/in-game-lists/types";
import { toDBBoolean } from "~/utils/sql";
import { userBuildsPage } from "~/utils/urls";
import { newBuildSchemaServer } from "../user-page-schemas.server";

export const action = defineAction(
	{ body: newBuildSchemaServer },
	async ({ body }) => {
		const user = requireUser();

		const commonArgs = {
			title: body.title,
			description: body.description,
			abilities: body.abilities as BuildAbilitiesTuple,
			headGearSplId: body.head,
			clothesGearSplId: body.clothes,
			shoesGearSplId: body.shoes,
			modes: body.modes,
			weaponSplIds: body.weapons.map((w) => w.id),
			ownerId: user.id,
			isPrivate: toDBBoolean(body.isPrivate),
		};

		if (body.buildToEditId) {
			await BuildRepository.update({
				id: body.buildToEditId,
				...commonArgs,
			});
		} else {
			await BuildRepository.insert(commonArgs);
		}

		return redirect(userBuildsPage(user));
	},
);
