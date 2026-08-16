import { type LoaderFunction, redirect } from "react-router";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { isSupporter } from "~/modules/permissions/utils";
import { userPage } from "~/utils/urls";

export const loader: LoaderFunction = async ({ params }) => {
	const user = await UserRepository.findByCustomUrl(params.customUrl!);

	if (!user || !isSupporter(user)) {
		return redirect("/");
	}

	return redirect(userPage(user));
};
