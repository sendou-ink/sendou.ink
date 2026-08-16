import "i18next";

import type { resources } from "~/modules/i18n/resources.server";

declare module "i18next" {
	interface CustomTypeOptions {
		defaultNS: "common";
		resources: (typeof resources)["en"];
	}
}
