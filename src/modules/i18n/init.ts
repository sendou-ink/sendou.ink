import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import commonEn from "../../../locales/en/common.json";
import { config } from "./config";

// xxx: temporary hack

const i18nInitPromise = i18next.use(initReactI18next).init({
	...config,
	lng: config.fallbackLng,
	resources: {
		en: {
			common: commonEn,
		},
	},
	showSupportNotice: false,
});

export { i18nInitPromise };
