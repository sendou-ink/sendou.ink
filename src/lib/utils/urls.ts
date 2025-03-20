import type { Tables } from "$lib/server/db/tables";

export const userPageUrl = (user: Pick<Tables["User"], "discordId" | "customUrl">) =>
	`/u/${user.customUrl ?? user.discordId}`;
