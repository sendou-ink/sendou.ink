import { RemixBrowser } from "@remix-run/react";
import i18next from "i18next";
import { hydrateRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { i18nLoader } from "./modules/i18n/loader";

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		// we will register it after the page complete the load
		void navigator.serviceWorker.register("/sw-2.js");
	});
}

i18nLoader()
	.then(() =>
		hydrateRoot(
			document,
			<I18nextProvider i18n={i18next}>
				<RemixBrowser />
			</I18nextProvider>,
		),
	)
	.catch(console.error);
