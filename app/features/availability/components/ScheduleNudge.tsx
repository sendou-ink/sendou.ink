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

/** Band under the events header on the last day of the week while next week is empty; dismissal is remembered for the week. */
export function ScheduleNudge({
	panel,
	onNavigate,
}: {
	/** Bleeds past the mobile events panel's padding rather than the sidebar's. */
	panel?: boolean;
	onNavigate?: () => void;
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
				onClick={onNavigate}
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
				onPress={dismiss}
			/>
		</div>
	);
}
