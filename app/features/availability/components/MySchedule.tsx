import * as React from "react";
import { useTranslation } from "react-i18next";
import type { FetcherWithComponents } from "react-router";
import * as R from "remeda";
import { SendouButton } from "~/components/elements/Button";
import { toastQueue } from "~/components/elements/Toast";
import { useUnsavedChangesChecker } from "~/form/UnsavedChangesGuard";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { saveWeekSchema } from "../availability-schemas";
import { scheduleWeekSearchParams } from "../availability-search-params";
import type { AvailabilityEditorWeek } from "../availability-types";
import type { MyScheduleData } from "../core/MySchedule.server";
import styles from "./MySchedule.module.css";
import { WeekAvailabilityEditor } from "./WeekAvailabilityEditor";
import { WeekToggle } from "./WeekToggle";

/** The events page's "My schedule": editor with current/next week toggle, "Copy last week" prefill and save. */
export function MySchedule({ data }: { data: MyScheduleData }) {
	const { t } = useTranslation(["schedule"]);
	const [{ week }, setParams] = useSearchParamsTyped(scheduleWeekSearchParams);
	const [weeks, setWeeks] = React.useState<Array<AvailabilityEditorWeek>>(() =>
		data.weeks.map((editorWeek) => editorWeek.days),
	);
	const { submit, fetcher, state } = useActionSubmit(saveWeekSchema, {
		encType: "application/json",
	});
	useSavedToast(fetcher);
	const { formatter: headingFormatter } = useDateTimeFormat({
		month: "short",
		day: "numeric",
	});

	// dirty = editor differs from the loader (a save revalidates it, reading clean again) or the day
	// popover holds uncommitted edits. Edits survive same-route navigations (view tabs), so only a
	// pathname change or a full unload warns
	const hasPendingDraftRef = React.useRef(false);
	const hasUnsavedChangesRef = React.useRef<
		Parameters<typeof useUnsavedChangesChecker>[0]["current"]
	>(() => false);
	hasUnsavedChangesRef.current = (navigation) =>
		fetcher.state === "idle" &&
		(!navigation ||
			navigation.currentLocation.pathname !==
				navigation.nextLocation.pathname) &&
		(hasPendingDraftRef.current ||
			!R.isDeepEqual(
				weeks,
				data.weeks.map((editorWeek) => editorWeek.days),
			));
	useUnsavedChangesChecker(hasUnsavedChangesRef);

	const weekIndex = week === "next" ? 1 : 0;
	const shownDays = weeks[weekIndex];

	const copySourceRanges =
		weekIndex === 0 ? data.lastWeekRanges : weeks[0].map((day) => day.ranges);
	const canCopy =
		copySourceRanges?.some((ranges) => ranges.length > 0) ?? false;

	const copyPreviousWeek = () => {
		if (!copySourceRanges) return;

		setWeeks(
			weeks.map((days, index) =>
				index === weekIndex
					? days.map((day, dayIndex) => ({
							...day,
							ranges: copySourceRanges[dayIndex],
						}))
					: days,
			),
		);
	};

	const saveWeek = () => {
		submit("SAVE_WEEK", {
			days: shownDays.map((day) => ({
				date: day.date,
				ranges: day.ranges,
				note: day.note,
			})),
		});
	};

	return (
		<section className="stack sm" data-testid="my-schedule">
			<div className={styles.header}>
				<h2 className="text-lg mx-2">{t("schedule:editor.title")}</h2>
				<WeekToggle
					name="my-schedule-week"
					value={week}
					onChange={(value) => setParams({ week: value })}
					renderExtra={(value) =>
						!data.weeks[value === "next" ? 1 : 0].submitted ? (
							<span
								className={styles.notFilled}
								data-testid={`week-not-filled-${value}`}
							>
								• {t("schedule:editor.notFilled")}
							</span>
						) : null
					}
				/>
			</div>
			<h3 className={styles.weekHeading}>
				{t("schedule:team.weekHeading", {
					week: data.weeks[weekIndex].weekNumber,
				})}{" "}
				·{" "}
				{headingFormatter.formatRange(
					dateAtNoon(shownDays[0].date),
					dateAtNoon(shownDays[6].date),
				)}
			</h3>
			<WeekAvailabilityEditor
				key={data.weeks[weekIndex].weekStartsAt}
				value={shownDays}
				commitments={data.commitments.map((commitment) => ({
					date: commitment.date,
					range: commitment.range,
					name: commitment.name ?? t("schedule:commitment.scrim"),
				}))}
				onChange={(value) =>
					setWeeks(
						weeks.map((days, index) => (index === weekIndex ? value : days)),
					)
				}
				onPendingDraftChange={(hasPendingDraft) => {
					hasPendingDraftRef.current = hasPendingDraft;
				}}
			/>
			<div className={styles.actions}>
				<SendouButton
					variant="outlined"
					size="small"
					isDisabled={!canCopy}
					onPress={copyPreviousWeek}
					testId="copy-last-week-button"
				>
					{t("schedule:editor.copyLastWeek")}
				</SendouButton>
				<SendouButton
					size="small"
					isDisabled={state !== "idle"}
					onPress={saveWeek}
					testId="save-week-button"
				>
					{t("schedule:editor.saveWeek")}
				</SendouButton>
			</div>
		</section>
	);
}

function useSavedToast(fetcher: FetcherWithComponents<unknown>) {
	const { t } = useTranslation(["schedule"]);
	const previousStateRef = React.useRef(fetcher.state);

	React.useEffect(() => {
		if (
			previousStateRef.current !== "idle" &&
			fetcher.state === "idle" &&
			fetcher.data === null
		) {
			toastQueue.add({
				message: t("schedule:editor.saved"),
				variant: "success",
			});
		}
		previousStateRef.current = fetcher.state;
	}, [fetcher.state, fetcher.data, t]);
}

function dateAtNoon(date: string) {
	const [year, month, day] = date.split("-").map(Number);

	return new Date(year, month - 1, day, 12);
}
