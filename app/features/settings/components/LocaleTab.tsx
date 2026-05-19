import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { useUser } from "~/features/auth/core/user";
import { SelectFormField } from "~/form/fields/SelectFormField";
import { SendouForm } from "~/form/SendouForm";
import { languages } from "~/modules/i18n/config";
import { clockFormatSchema, dateFormatSchema } from "../settings-schemas";

// xxx: all select not 100%

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
					autoSubmit
					revalidateRoot
				>
					{({ FormField }) => <FormField name="newValue" />}
				</SendouForm>
			) : null}
			{user ? (
				<SendouForm
					schema={dateFormatSchema}
					defaultValues={{
						newValue: user.preferences.dateFormat ?? "auto",
					}}
					autoSubmit
					revalidateRoot
				>
					{({ FormField }) => <FormField name="newValue" />}
				</SendouForm>
			) : null}
		</div>
	);
}

function LanguageSelector() {
	const { t, i18n } = useTranslation(["common"]);
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();

	const languageItems = languages.map((lang) => ({
		value: lang.code,
		label: lang.name,
	}));

	const handleLanguageChange = (newLang: string | null) => {
		if (!newLang) return;
		const next = new URLSearchParams(searchParams);
		next.delete("lng");
		next.append("lng", newLang);
		navigate(`?${next.toString()}`);
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
