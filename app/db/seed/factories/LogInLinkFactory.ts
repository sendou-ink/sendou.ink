import * as LogInLinkRepository from "~/features/auth/LogInLinkRepository.server";
import { defineFactory } from "../core/defineFactory";

/** Single use links of the log in with a code flow; `userId` is who the link logs in. */
export const { create } = defineFactory({
	insert: ({ userId }: { userId: number }) =>
		LogInLinkRepository.insert(userId),
});
