import { Eye, Pencil, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import { translatePage } from "~/utils/urls";
import * as TranslationDrafts from "../core/TranslationDrafts";
import type { TranslateLanguageLoaderData } from "../loaders/translate.$language.server";
import { useTranslationDrafts } from "../translate-drafts";
import { previewLanguagePersisted } from "../translate-persisted";
import styles from "./TranslationPreview.module.css";

/**
 * Overrides the site's translations with the drafts kept in this browser when a preview was started on the
 * /translate page. Applied after hydration as the server never sees the drafts.
 */
export function TranslationPreview() {
	const { i18n } = useTranslation();
	const [previewLanguage, setPreviewLanguage] = usePersistedState(
		previewLanguagePersisted,
	);

	const isActive =
		previewLanguage !== null && i18n.language === previewLanguage;
	const drafts = useTranslationDrafts(previewLanguage ?? "");

	// the language's translate page has what the drafts are checked against
	const { load, data } = useFetcher<TranslateLanguageLoaderData>();
	const catalog = data?.catalog;

	React.useEffect(() => {
		if (isActive && previewLanguage) load(translatePage(previewLanguage));
	}, [isActive, previewLanguage, load]);

	React.useEffect(() => {
		if (!isActive || !previewLanguage || !catalog) return;

		const { pending } = TranslationDrafts.sort({ catalog, drafts });
		const apply = (namespaces: string[]) => {
			let applied = false;
			for (const namespace of namespaces) {
				if (!pending[namespace]) continue;
				if (!i18n.hasResourceBundle(previewLanguage, namespace)) continue;

				i18n.addResourceBundle(
					previewLanguage,
					namespace,
					pending[namespace],
					true,
					true,
				);
				applied = true;
			}

			// re-renders every component using translations
			if (applied) i18n.emit("languageChanged", i18n.language);
		};

		const onLoaded = (loaded: Record<string, Record<string, boolean>>) =>
			apply(Object.keys(loaded[previewLanguage] ?? {}));

		apply(Object.keys(pending));
		i18n.on("loaded", onLoaded);

		return () => {
			i18n.off("loaded", onLoaded);
		};
	}, [isActive, previewLanguage, catalog, drafts, i18n]);

	if (!previewLanguage) return null;

	const stopPreview = () => {
		setPreviewLanguage(null);
		// drafts were written over the loaded translations
		window.location.reload();
	};

	return (
		<div className={styles.banner} data-testid="translation-preview-banner">
			<Eye className={styles.icon} />
			<span>Previewing your translation drafts</span>
			<div className={styles.actions}>
				<LinkButton
					to={translatePage(previewLanguage)}
					size="miniscule"
					variant="minimal"
					shape="circle"
					icon={<Pencil />}
					aria-label="Edit translation drafts"
				/>
				<SendouButton
					size="miniscule"
					variant="minimal"
					shape="circle"
					icon={<X />}
					onClick={stopPreview}
					aria-label="Stop preview"
				/>
			</div>
		</div>
	);
}
