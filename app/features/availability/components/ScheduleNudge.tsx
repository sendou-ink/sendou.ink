import clsx from "clsx";
import { CalendarPlus, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { EVENTS_PAGE } from "~/utils/urls";
import { dismissScheduleNudgeSchema } from "../availability-schemas";
import { scheduleWeekSearchParams } from "../availability-search-params";
import styles from "./ScheduleNudge.module.css";

/**
 * Prompt to report next week's availability, shown on the last day of the week
 * while next week is still empty. Sits as a band right under the events header.
 * Dismissing it is remembered for the week, so it can be waved away without
 * filling anything in.
 */
export function ScheduleNudge({
	panel,
}: {
	/** Bleeds past the mobile events panel's padding rather than the sidebar's. */
	panel?: boolean;
}) {
	const { t } = useTranslation(["front"]);
	const [dismissed, setDismissed] = React.useState(false);
	const { submit } = useActionSubmit(dismissScheduleNudgeSchema, {
		action: EVENTS_PAGE,
		encType: "application/json",
	});

	if (dismissed) return null;

	const dismiss = () => {
		setDismissed(true);
		submit("DISMISS_SCHEDULE_NUDGE", { revalidateRoot: true });
	};

	return (
		<div
			className={clsx(styles.container, panel ? styles.panel : styles.sidebar)}
		>
			<Link
				to={scheduleWeekSearchParams.href(EVENTS_PAGE, { week: "next" })}
				className={styles.link}
			>
				<CalendarPlus size={14} />
				{t("front:sideNav.scheduleNudge")}
			</Link>
			<SendouButton
				icon={<X size={14} />}
				variant="minimal"
				size="miniscule"
				className={styles.dismissButton}
				aria-label={t("front:sideNav.scheduleNudge.dismiss")}
				onClick={dismiss}
			/>
		</div>
	);
}
