import "dotenv/config";
import { sql } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const id = process.argv[2]?.trim();
const newName = process.argv[3]?.trim();

invariant(id, "id of badge is required (argument 1)");
invariant(newName, "display name of badge is required (argument 2)");
invariant(
	newName !== newName.toLocaleLowerCase(),
	"displayName of badge must have at least one uppercase letter",
);

sql
	.prepare("update badge set displayName = @newName where id = @id")
	.run({ id, newName });

logger.info(`Added updated name. New name: ${newName}`);
