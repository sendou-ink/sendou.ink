import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { countryCodeToTranslatedName } from "~/utils/i18n";

export function Flag({
	countryCode,
	tiny = false,
}: {
	countryCode: string;
	tiny?: boolean;
}) {
	const { i18n } = useTranslation();

	return (
		<span
			className={clsx(`twf twf-${countryCode.toLowerCase()}`, {
				"twf-s": tiny,
			})}
			data-testid={`flag-${countryCode}`}
			title={countryCodeToTranslatedName({
				countryCode,
				language: i18n.language,
			})}
		/>
	);
}
