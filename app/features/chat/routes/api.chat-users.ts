import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { chatUsersSearchParams } from "../chat-search-params";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	requireUser();

	const { ids } = chatUsersSearchParams.parse(url);

	if (ids.length === 0) {
		return Response.json({});
	}

	const users = await UserRepository.findChatUsersByUserIds(ids);
	return Response.json(users);
};
