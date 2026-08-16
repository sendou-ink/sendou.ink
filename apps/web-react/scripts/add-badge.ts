import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const code = process.argv[2]?.trim();
const displayName = process.argv[3]?.trim();
const rawHue = process.argv[4]?.trim();
const parsedHue = rawHue ? Number(rawHue) : undefined;

invariant(code, "code of badge is required (argument 1)");
invariant(code === code.toLocaleLowerCase(), "code of badge must be lowercase");
invariant(displayName, "display name of badge is required (argument 2)");
invariant(
	displayName !== displayName.toLocaleLowerCase(),
	"displayName of badge must have at least one uppercase letter",
);
invariant(
	!parsedHue ||
		(parsedHue >= -360 && parsedHue <= 360 && Number.isInteger(parsedHue)),
	"hue must be between -360 and 360",
);

await BadgeRepository.insert({
	code,
	displayName,
	hue: parsedHue ?? null,
	authorId: null,
});

logger.info(`Added new badge: ${displayName}`);
