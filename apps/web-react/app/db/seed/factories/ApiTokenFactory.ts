import * as ApiRepository from "~/features/api/ApiRepository.server";
import type { ApiTokenType } from "~/features/api/api-types";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = {
	userId: number;
	type: ApiTokenType;
};

/**
 * Creates API tokens. `userId` is whose token it is — note that having one and being
 * allowed to use it are separate things, the permission coming from the user's roles.
 * The token itself is the repository's own.
 */
export const { create } = defineFactory({
	defaults: () => ({ type: "read" as const }),
	insert: ({ userId, type }: InsertArgs) =>
		ApiRepository.generateToken(userId, type),
});
