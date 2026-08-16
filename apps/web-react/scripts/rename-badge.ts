import invariant from "@sendou/utils/invariant";
import { logger } from "@sendou/utils/logger";
import { db } from "~/db/sql";

const id = process.argv[2]?.trim();
const newName = process.argv[3]?.trim();

invariant(id, "id of badge is required (argument 1)");
invariant(newName, "display name of badge is required (argument 2)");
invariant(
	newName !== newName.toLocaleLowerCase(),
	"displayName of badge must have at least one uppercase letter",
);

await db
	.updateTable("Badge")
	.set({ displayName: newName })
	.where("id", "=", Number(id))
	.execute();

logger.info(`Added updated name. New name: ${newName}`);
