import "dotenv/config";
import { sql } from "~/db/sql";
import invariant from "~/utils/invariant";

const discordId = process.argv[2]?.trim();
const discordId2 = process.argv[3]?.trim();

invariant(discordId, "discord id is required (argument 1)");
invariant(discordId2, "discord id (2) is required (argument 2)");
invariant(discordId !== discordId2, "discord ids must be different");

const tempDiscordId = "temp-discord-id";

const stm = sql.prepare(
	/** sql */ `update "User" set "discordId" = @newDiscordId where "discordId" = @discordId;`,
);

// swap user discordIds
sql.transaction(() => {
	stm.run({
		discordId: discordId,
		newDiscordId: tempDiscordId,
	});

	stm.run({
		discordId: discordId2,
		newDiscordId: discordId,
	});

	stm.run({
		discordId: tempDiscordId,
		newDiscordId: discordId2,
	});
})();
