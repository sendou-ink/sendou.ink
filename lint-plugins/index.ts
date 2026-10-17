import { noAndConditionalRendering } from "./no-and-conditional-rendering";
import { noKyselySqliteHelpers } from "./no-kysely-sqlite-helpers";
import { noRawActionForms } from "./no-raw-action-forms";
import { noRawActions } from "./no-raw-actions";
import { noRawDbWritesInDevSeed } from "./no-raw-db-writes-in-dev-seed";
import { noRawDbWritesInTests } from "./no-raw-db-writes-in-tests";
import { noRawSearchParams } from "./no-raw-search-params";
import { noRawWebStorage } from "./no-raw-web-storage";
import { noRelativeLinks } from "./no-relative-links";

// eslint-disable-next-line import/no-default-export -- bun lint loads a plugin from its default export
export default {
	meta: { name: "sendou" },
	rules: {
		"no-and-conditional-rendering": noAndConditionalRendering,
		"no-kysely-sqlite-helpers": noKyselySqliteHelpers,
		"no-raw-action-forms": noRawActionForms,
		"no-raw-actions": noRawActions,
		"no-raw-db-writes-in-dev-seed": noRawDbWritesInDevSeed,
		"no-raw-db-writes-in-tests": noRawDbWritesInTests,
		"no-raw-search-params": noRawSearchParams,
		"no-raw-web-storage": noRawWebStorage,
		"no-relative-links": noRelativeLinks,
	},
};
