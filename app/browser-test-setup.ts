import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { config } from "~/modules/i18n/config";
import { resources } from "~/modules/i18n/resources.browser";

import "~/styles/common.css";
import "~/styles/elements.css";
import "~/styles/flags.css";
import "~/styles/layout.css";
import "~/styles/reset.css";
import "~/styles/utils.css";
import "~/styles/vars.css";

i18next.use(initReactI18next).init({
	...config,
	lng: "en",
	resources,
});
