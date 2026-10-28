import { useTranslation } from "react-i18next";
import { Link, useLoaderData, useMatches } from "react-router";
import { useUser } from "~/features/auth/core/user";
import { SelectFormField } from "~/form/fields/SelectFormField";
import { SendouForm } from "~/form/SendouForm";
import {
	type GameLanguageCode,
	gameLanguages,
	type LanguageCode,
	languages,
} from "~/modules/i18n/config";
import { languageSearchParams } from "~/modules/i18n/i18n-search-params";
import { useSearchParam } from "~/modules/search-params/hooks";
import type { RootLoaderData } from "~/root";
import { TRANSLATE_PAGE, translatePage } from "~/utils/urls";
import type { loader } from "../loaders/settings.server";
import { clockFormatSchema } from "../settings-schemas";
import styles from "./LocaleTab.module.css";

export function LocaleTab() {
	const user = useUser();

	return (
		<div className="stack md">
			<LanguageSelector />
			<GameLanguageSelector />
			{user ? (
				<SendouForm
					schema={clockFormatSchema}
					defaultValues={{
						newValue: user.preferences.clockFormat ?? "auto",
					}}
					mode="autoSubmit"
					revalidateRoot
					fullWidth
				>
					{({ FormField }) => <FormField name="newValue" />}
				</SendouForm>
			) : null}
		</div>
	);
}

function LanguageSelector() {
	const { t, i18n } = useTranslation(["common", "settings"]);
	const [, setLng] = useSearchParam(languageSearchParams, "lng");

	const languageItems = languages.map((lang) => ({
		value: lang.code,
		label: lang.name,
	}));

	const handleLanguageChange = (newLang: LanguageCode | null) => {
		if (!newLang) return;
		setLng(newLang, { replace: false });
	};

	return (
		<div className="stack xs">
			<SelectFormField
				label={t("common:header.language")}
				items={languageItems}
				value={i18n.language as LanguageCode}
				onChange={handleLanguageChange}
			/>
			<TranslationProgress language={i18n.language} />
		</div>
	);
}

function TranslationProgress({ language }: { language: string }) {
	const { t } = useTranslation(["settings"]);
	const data = useLoaderData<typeof loader>();

	const progress = data.translationProgress.find(
		(languageProgress) => languageProgress.language === language,
	);

	if (!progress) {
		return (
			<Link to={TRANSLATE_PAGE} className="text-xs font-semi-bold">
				{t("settings:locale.helpTranslate")}
			</Link>
		);
	}

	const percentage =
		progress.total === 0
			? 100
			: Math.floor((progress.translated / progress.total) * 100);

	return (
		<div className={styles.translationProgress}>
			<progress value={progress.translated} max={progress.total} />
			<span className="text-lighter">
				{t("settings:locale.translatedPercentage", { percentage })}
			</span>
			<Link to={translatePage(language)} className="font-semi-bold">
				{t("settings:locale.helpTranslate")}
			</Link>
		</div>
	);
}

function GameLanguageSelector() {
	const { t } = useTranslation(["settings"]);
	const [root] = useMatches();
	const rootData = root.loaderData as RootLoaderData | undefined;
	const [, setGameLng] = useSearchParam(languageSearchParams, "gameLng");

	const languageItems = gameLanguages.map((lang) => ({
		value: lang.code,
		label: lang.name,
	}));

	const handleLanguageChange = (newLang: GameLanguageCode | null) => {
		if (!newLang) return;
		setGameLng(newLang, { replace: false });
	};

	return (
		<SelectFormField
			label={t("settings:locale.gameLanguage")}
			bottomText={t("settings:locale.gameLanguage.bottomText")}
			items={languageItems}
			value={rootData?.gameLanguage ?? null}
			onChange={handleLanguageChange}
		/>
	);
}
