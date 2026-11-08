import { useTranslation } from "react-i18next";
import { FormMessage } from "~/components/FormMessage";
import { useHydrated } from "~/hooks/useHydrated";

/** Tells a form's times are entered in the venue's zone, shown only when it isn't the browser's own. */
export function VenueTimeNotice({ timeZone }: { timeZone: string | null }) {
	const { t } = useTranslation(["forms"]);
	const isHydrated = useHydrated();

	if (
		!timeZone ||
		!isHydrated ||
		timeZone === Intl.DateTimeFormat().resolvedOptions().timeZone
	) {
		return null;
	}

	return (
		<FormMessage type="info" spaced={false}>
			{t("forms:datetime.venueTimeNotice", { timeZone })}
		</FormMessage>
	);
}
