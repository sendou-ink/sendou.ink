import clsx from "clsx";
import { useTranslation } from "react-i18next";

export function Flag({
	countryCode,
	tiny = false,
}: {
	countryCode: string;
	tiny?: boolean;
}) {
	const { i18n } = useTranslation();
	return (
		<div
			className={clsx(`twf twf-${countryCode.toLowerCase()}`, {
				"twf-s": tiny,
			})}
			data-testid={`flag-${countryCode}`}
			title={new Intl.DisplayNames([i18n.language], { type: "region" }).of(
				countryCode,
			)}
		/>
	);
}
