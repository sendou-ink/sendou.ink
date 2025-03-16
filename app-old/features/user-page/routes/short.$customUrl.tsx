import type { LoaderFunction } from "@remix-run/node";
import { redirect } from "react-router-dom";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { userPage } from "~/utils/urls";
import { isAtLeastFiveDollarTierPatreon } from "~/utils/users";

export const loader: LoaderFunction = async ({ params }) => {
	const user = await UserRepository.findByCustomUrl(params.customUrl!);

	if (!user || !isAtLeastFiveDollarTierPatreon(user)) {
		return redirect("/");
	}

	return redirect(userPage(user));
};
