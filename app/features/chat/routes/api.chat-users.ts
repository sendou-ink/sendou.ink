import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	requireUser();

	const url = new URL(request.url);
	const idsParam = url.searchParams.get("ids");

	if (!idsParam) {
		return Response.json({});
	}

	const parsedIds = idsParam
		.split(",")
		.map(Number)
		.filter((id) => Number.isInteger(id) && id > 0);

	if (parsedIds.length === 0) {
		return Response.json({});
	}

	const users = await UserRepository.findChatUsersByUserIds(parsedIds);
	return Response.json(users);
};
