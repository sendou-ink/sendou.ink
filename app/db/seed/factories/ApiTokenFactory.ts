import * as ApiRepository from "~/features/api/ApiRepository.server";
import type { ApiTokenType } from "~/features/api/api-types";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = {
	userId: number;
	type: ApiTokenType;
};

/** Having a token and being allowed to use it are separate things: the permission comes from the user's roles. */
export const { create } = defineFactory({
	defaults: () => ({ type: "read" as const }),
	insert: ({ userId, type }: InsertArgs) =>
		ApiRepository.generateToken(userId, type),
});
