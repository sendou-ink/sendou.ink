// validates all articles files in the project are following the correct .md + grey matter format

import { logger } from "@sendou/utils/logger";
import { mostRecentArticles } from "~/features/articles/core/list.server";

async function main() {
	await mostRecentArticles(1000);
}

main()
	.then(() => {
		logger.info("Articles are valid.");
		process.exit(0);
	})
	.catch((error) => {
		logger.error("Error validating articles:", error);
		process.exit(1);
	});
