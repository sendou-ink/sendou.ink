import * as LinkedRoles from "../features/discord/core/LinkedRoles.server";
import * as DiscordTokenRepository from "../features/discord/DiscordTokenRepository.server";
import { Routine } from "./routine.server";

/** Catches what no action pushes (e.g. a timed ban running out) and deletes tokens Discord no longer accepts. */
export const SyncDiscordLinkedRolesRoutine = new Routine({
	name: "SyncDiscordLinkedRoles",
	func: async () => {
		await LinkedRoles.syncUsers(await DiscordTokenRepository.findAllUserIds());
	},
});
