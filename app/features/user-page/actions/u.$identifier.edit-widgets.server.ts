import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import type { StoredWidget } from "~/features/user-page/core/widgets/types";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { widgetsEditSchema } from "~/features/user-page/user-page-schemas";
import { parseRequestPayload } from "~/utils/remix.server";
import { userPage } from "~/utils/urls";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);

	const payload = await parseRequestPayload({
		request,
		schema: widgetsEditSchema,
	});

	await UserRepository.upsertWidgets(
		user.id,
		payload.widgets as StoredWidget[],
	);

	return redirect(userPage(user));
};
