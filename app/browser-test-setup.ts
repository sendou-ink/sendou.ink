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
document.documentElement.style.setProperty("--popover-boundary-top", "0px");
document.documentElement.style.setProperty("--popover-boundary-bottom", "0px");

i18next.use(initReactI18next).init({
	...config,
	lng: "en",
	resources,
});
