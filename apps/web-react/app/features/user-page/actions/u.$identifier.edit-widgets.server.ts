import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import type { StoredWidget } from "~/features/user-page/core/widgets/types";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { widgetsEditSchema } from "~/features/user-page/user-page-schemas";
import { parseFormData } from "~/form/parse.server";
import { userPage } from "~/utils/urls";

export const action = async ({ request }: { request: Request }) => {
	const user = requireUser();

	const result = await parseFormData({
		request,
		schema: widgetsEditSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	await UserRepository.upsertWidgets(
		user.id,
		result.data.widgets as StoredWidget[],
	);

	return redirect(userPage(user));
};
