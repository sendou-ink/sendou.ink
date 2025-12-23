import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);

	const currentWidgets = await UserRepository.storedWidgetsByUserId(user.id);

	return { currentWidgets };
};
