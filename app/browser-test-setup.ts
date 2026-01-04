import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { config } from "~/modules/i18n/config";
import { resources } from "~/modules/i18n/resources.browser";

import "~/styles/vars.css";
import "~/styles/normalize.css";
import "~/styles/common.css";
import "~/styles/utils.css";
import "~/styles/flags.css";

document.documentElement.classList.add("dark");

i18next.use(initReactI18next).init({
	...config,
	lng: "en",
	resources,
});
