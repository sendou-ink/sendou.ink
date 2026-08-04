import { useTranslation } from "react-i18next";
import { useUser } from "~/features/auth/core/user";
import { SelectFormField } from "~/form/fields/SelectFormField";
import { SendouForm } from "~/form/SendouForm";
import { languages } from "~/modules/i18n/config";
import { useSearchParam } from "~/modules/search-params/hooks";
import { clockFormatSchema } from "../settings-schemas";
import { settingsSearchParams } from "../settings-search-params";

export function LocaleTab() {
	const user = useUser();

	return (
		<div className="stack md">
			<LanguageSelector />
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
	const { t, i18n } = useTranslation(["common"]);
	const [, setLng] = useSearchParam(settingsSearchParams, "lng");

	const languageItems = languages.map((lang) => ({
		value: lang.code,
		label: lang.name,
	}));

	const handleLanguageChange = (newLang: string | null) => {
		if (!newLang) return;
		setLng(newLang, { replace: false });
	};

	return (
		<SelectFormField
			label={t("common:header.language")}
			items={languageItems}
			value={i18n.language}
			onChange={handleLanguageChange}
		/>
	);
}
