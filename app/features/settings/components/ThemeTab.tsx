import { useTranslation } from "react-i18next";
import { useMatches } from "react-router";
import { CustomThemeSelector } from "~/components/CustomThemeSelector";
import { FormMessage } from "~/components/FormMessage";
import { Theme, useTheme } from "~/features/theme/core/provider";
import { SelectFormField } from "~/form/fields/SelectFormField";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useHasRole } from "~/modules/permissions/hooks";
import type { RootLoaderData } from "~/root";
import type { ThemeInput } from "~/utils/oklch-gamut";
import { customThemeSchema } from "../settings-schemas";

export function ThemeTab() {
	const { t } = useTranslation(["common"]);

	return (
		<div className="stack md">
			<ThemeSelector />
			<CustomColorSelector />
			<FormMessage type="info">{t("common:settings.themeInfo")}</FormMessage>
		</div>
	);
}

function ThemeSelector() {
	const { t } = useTranslation(["common"]);
	const { userTheme, setUserTheme } = useTheme();

	const themeItems = (["auto", Theme.DARK, Theme.LIGHT] as const).map(
		(theme) => ({
			value: theme,
			label: t(`common:theme.${theme}`),
		}),
	);

	const handleThemeChange = (newTheme: string | null) => {
		if (!newTheme) return;
		setUserTheme(newTheme as Theme);
	};

	return (
		<SelectFormField
			label={t("common:header.theme")}
			items={themeItems}
			value={userTheme ?? "auto"}
			onChange={handleThemeChange}
		/>
	);
}

function CustomColorSelector() {
	const [root] = useMatches();
	const rootData = root.loaderData as RootLoaderData | undefined;
	const isSupporter = useHasRole("SUPPORTER");
	const { submit, state } = useActionSubmit(customThemeSchema, {
		encType: "application/json",
	});

	const handleSave = (themeInput: ThemeInput) => {
		submit("UPDATE_CUSTOM_THEME", {
			newValue: themeInput,
			revalidateRoot: true,
		});
	};

	const handleReset = () => {
		submit("UPDATE_CUSTOM_THEME", { newValue: null, revalidateRoot: true });
	};

	return (
		<CustomThemeSelector
			isPersonalTheme
			initialTheme={rootData?.customTheme}
			isSupporter={isSupporter}
			onSave={handleSave}
			onReset={handleReset}
			fetcherState={state}
		/>
	);
}
