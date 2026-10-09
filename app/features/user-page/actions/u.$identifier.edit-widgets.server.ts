import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import type { StoredWidget } from "~/features/user-page/core/widgets/types";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { isSupporter } from "~/modules/permissions/utils";
import { userPage } from "~/utils/urls";
import { widgetsEditSchema } from "../user-page-schemas";

export const action = defineAction(
	{ body: async () => widgetsEditSchema(isSupporter(requireUser())) },
	async ({ body }) => {
		const user = requireUser();

		await UserRepository.upsertWidgets(user.id, body.widgets as StoredWidget[]);

		return redirect(userPage(user));
	},
);
