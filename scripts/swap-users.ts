import { db } from "~/db/sql";
import invariant from "~/utils/invariant";

const discordId = process.argv[2]?.trim();
const discordId2 = process.argv[3]?.trim();

invariant(discordId, "discord id is required (argument 1)");
invariant(discordId2, "discord id (2) is required (argument 2)");
invariant(discordId !== discordId2, "discord ids must be different");

const tempDiscordId = "temp-discord-id";

// swap user discordIds
await db.transaction().execute(async (trx) => {
	const swap = (from: string, to: string) =>
		trx
			.updateTable("User")
			.set({ discordId: to })
			.where("discordId", "=", from)
			.execute();

	await swap(discordId, tempDiscordId);
	await swap(discordId2, discordId);
	await swap(tempDiscordId, discordId2);
});
