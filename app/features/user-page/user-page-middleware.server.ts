import type { MiddlewareFunction } from "react-router";
import { notFoundIfNullish } from "~/utils/remix.server";
import * as UserRepository from "./UserRepository.server";
import { userPageAsyncLocalStorage } from "./user-page-context.server";

export const userPageMiddleware: MiddlewareFunction<Response> = async (
	{ params },
	next,
) => {
	const user = notFoundIfNullish(
		await UserRepository.findPageUserByIdentifier(params.identifier!),
	);

	return userPageAsyncLocalStorage.run({ user }, () => next());
};
