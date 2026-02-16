import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";

export const loader = async () => {
	const user = requireUser();

	const currentWidgets = await UserRepository.storedWidgetsByUserId(user.id);

	return { currentWidgets };
};
