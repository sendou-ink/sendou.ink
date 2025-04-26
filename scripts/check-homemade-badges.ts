import { z } from "zod";
import badgesJson from "~/features/badges/homemade.json";

const schema = z.record(
	z.string(),
	z.object({
		displayName: z.string().min(1).max(50),
		authorDiscordId: z.string().regex(/^\d{17,19}$/),
	}),
);

const parsedBadges = schema.safeParse(badgesJson);
if (!parsedBadges.success) {
	console.error(
		"Invalid homemade.json format",
		JSON.stringify(parsedBadges.error),
	);
	process.exit(1);
}

const badges = parsedBadges.data;

// check keys in alphabetical order
let lastKey = "";
for (const key of Object.keys(badges)) {
	if (key.localeCompare(lastKey) < 0) {
		console.error(`Invalid key order in homemade.json: ${lastKey} > ${key}`);
		process.exit(1);
	}
	lastKey = key;
}

// check each key has the 3 matching files in the right location
// etc.
