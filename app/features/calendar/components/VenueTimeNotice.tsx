import { useTranslation } from "react-i18next";
import { FormMessage } from "~/components/FormMessage";
import { useHydrated } from "~/hooks/useHydrated";
import { localTimeZone, zonesReadSameClock } from "~/utils/dates";

/** Tells a form's times are entered in the venue's zone, shown only when it reads another clock than the browser's. */
export function VenueTimeNotice({ timeZone }: { timeZone: string | null }) {
	const { t } = useTranslation(["forms"]);
	const isHydrated = useHydrated();

	if (
		!timeZone ||
		!isHydrated ||
		zonesReadSameClock(timeZone, localTimeZone())
	) {
		return null;
	}

	return (
		<FormMessage type="info" spaced={false}>
			{t("forms:datetime.venueTimeNotice", { timeZone })}
		</FormMessage>
	);
}
