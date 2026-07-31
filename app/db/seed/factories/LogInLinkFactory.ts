import * as LogInLinkRepository from "~/features/auth/LogInLinkRepository.server";
import { defineFactory } from "../core/defineFactory";

/**
 * Creates the single use links the log in with a code flow hands out. `userId` is
 * who the link logs in; its code and expiry are the repository's own.
 */
export const { create } = defineFactory({
	insert: ({ userId }: { userId: number }) =>
		LogInLinkRepository.insert(userId),
});
