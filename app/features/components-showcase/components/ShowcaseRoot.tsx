import i18next from "i18next";
import { useState, useSyncExternalStore } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SendouToastRegion } from "~/components/elements/Toast";
import { Theme, ThemeProvider } from "~/features/theme/core/provider";
import { config } from "~/modules/i18n/config";
import { resources } from "~/modules/i18n/resources.browser";
import type { ShowcaseSectionId } from "../showcase-sections";
import { ShowcaseSection } from "./ShowcaseSections";

const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({ ...config, lng: "en", resources });

/**
 * A section of the components showcase rendered outside the app, by the docs site (`docs/site`):
 * gives it the translations, router and theme the app's root would, the theme following the docs site's.
 */
export function ShowcaseRoot({
	sectionId,
	examples,
}: {
	sectionId: ShowcaseSectionId;
	/** `ComponentRow` label → the syntax highlighted source of its example (HTML). */
	examples: Record<string, string>;
}) {
	const [router] = useState(() =>
		createMemoryRouter([
			{
				path: "*",
				element: (
					<DocsThemeProvider>
						<ShowcaseSection id={sectionId} examples={examples} />
						<SendouToastRegion />
					</DocsThemeProvider>
				),
			},
		]),
	);

	return (
		<I18nextProvider i18n={i18n}>
			<RouterProvider router={router} />
		</I18nextProvider>
	);
}

function DocsThemeProvider({ children }: { children: React.ReactNode }) {
	const docsTheme = useSyncExternalStore(
		subscribeToDocsTheme,
		() => document.documentElement.dataset.theme,
		() => undefined,
	);

	return (
		<ThemeProvider
			themeSource="static"
			specifiedTheme={docsTheme === "light" ? Theme.LIGHT : Theme.DARK}
		>
			{children}
		</ThemeProvider>
	);
}

/** Starlight keeps the chosen theme in `<html data-theme>`. */
function subscribeToDocsTheme(onChange: () => void) {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["data-theme"],
	});

	return () => observer.disconnect();
}
