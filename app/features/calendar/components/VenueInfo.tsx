import clsx from "clsx";
import { MapPin, SquareArrowOutUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LinkButton } from "~/components/elements/Button";
import type { Tables } from "~/db/tables";
import { openStreetMapUrl } from "~/utils/urls";
import styles from "./VenueInfo.module.css";

/** Where a LAN is held: venue name, address and a link to it on OpenStreetMap. */
export function VenueInfo({
	venue,
	className,
}: {
	/** Of the full width row the venue card sits in, e.g. `justify-center` to center it. */
	className?: string;
	venue: Pick<
		Tables["CalendarEventVenue"],
		"name" | "address" | "latitude" | "longitude"
	>;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<div className={clsx(styles.container, className)}>
			<div className={styles.venue} data-testid="venue-info">
				<MapPin className={styles.icon} aria-hidden />
				<div className={styles.name}>{venue.name}</div>
				<div className={styles.address}>{venue.address}</div>
				<LinkButton
					to={openStreetMapUrl(venue)}
					variant="outlined"
					size="small"
					className={styles.button}
					isExternal
				>
					{t("common:venue.openInMaps")}
					<SquareArrowOutUpRight className={styles.externalIcon} aria-hidden />
				</LinkButton>
			</div>
		</div>
	);
}
