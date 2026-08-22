import clsx from "clsx";
import {
	ChevronLeft,
	ChevronRight,
	Flag,
	Plus,
	SquarePen,
	Trash,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouAnchoredPopover } from "~/components/elements/Popover";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { TimeRangeFormField } from "~/form/fields/TimeRangeFormField";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { AVAILABILITY } from "../availability-constants";
import type {
	AvailabilityEditorDay,
	AvailabilityEditorWeek,
	DayTimeRange,
	EditorCommitment,
} from "../availability-types";
import * as Availability from "../core/Availability";
import styles from "./WeekAvailabilityEditor.module.css";

const MOVE_THRESHOLD_PX = 4;
const AXIS_LABEL_EVERY_HOURS = 2;

type Gesture =
	| {
			type: "paint";
			dayIndex: number;
			anchor: number;
			range: DayTimeRange | null;
	  }
	| {
			type: "move";
			dayIndex: number;
			original: DayTimeRange;
			range: DayTimeRange;
			startClientX: number;
			moved: boolean;
	  }
	| {
			type: "resize";
			dayIndex: number;
			original: DayTimeRange;
			edge: "start" | "end";
			range: DayTimeRange;
	  }
	| {
			type: "fill";
			dayIndex: number;
			range: DayTimeRange;
			targetDayIndex: number;
	  };

interface DraftRange {
	id: number;
	start: string;
	end: string;
}

interface DayDraft {
	ranges: Array<DraftRange>;
	note: string;
}

/**
 * One week of the user's own availability as an editable timeline: on wide
 * containers each day is a track where ranges are painted, moved, resized and
 * drag-filled with the pointer; on narrow containers a stacked per-day list.
 * Both share the same popover with exact time inputs and the day note, which
 * is also the keyboard path. Commitments render as locked blocks on the
 * tracks; gestures may cross them, but a new range cannot start on one.
 */
export function WeekAvailabilityEditor({
	value,
	onChange,
	commitments = [],
}: {
	value: AvailabilityEditorWeek;
	onChange: (value: AvailabilityEditorWeek) => void;
	commitments?: Array<EditorCommitment>;
}) {
	const { t } = useTranslation(["schedule", "common"]);
	const { formatter: dayFormatter } = useDateTimeFormat({
		weekday: "short",
		day: "numeric",
	});
	const { formatter: hourFormatter } = useDateTimeFormat({ hour: "numeric" });
	const { formatter: timeFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "2-digit",
	});

	const [gesture, setGesture] = React.useState<Gesture | null>(null);
	const gestureRef = React.useRef<Gesture | null>(null);
	const [earlierShown, setEarlierShown] = React.useState(false);
	const [laterShown, setLaterShown] = React.useState(false);
	const [openDayDate, setOpenDayDate] = React.useState<string | null>(null);
	const [openDayAddRow, setOpenDayAddRow] = React.useState(false);
	const popoverAnchorRef = React.useRef<HTMLElement | null>(null);
	const dayDraftRef = React.useRef<DayDraft | null>(null);
	const trackRefs = React.useRef<Array<HTMLDivElement | null>>([]);
	const suppressClickRef = React.useRef(false);

	const trackStart = earlierShown
		? AVAILABILITY.TRACK_EARLIER_START_MINUTES
		: AVAILABILITY.TRACK_START_MINUTES;
	const trackEnd = laterShown
		? AVAILABILITY.TRACK_LATER_END_MINUTES
		: AVAILABILITY.TRACK_END_MINUTES;

	const wallsOf = (date: string) =>
		commitments
			.filter((commitment) => commitment.date === date)
			.map((commitment) => commitment.range);

	const pct = (minutes: number) =>
		((Math.min(Math.max(minutes, trackStart), trackEnd) - trackStart) /
			(trackEnd - trackStart)) *
		100;

	const barStyle = (range: DayTimeRange) => ({
		left: `${pct(range.start)}%`,
		width: `${pct(range.end) - pct(range.start)}%`,
	});

	const dateAt = (date: string, minutes: number) => {
		const [year, month, day] = date.split("-").map(Number);

		return new Date(year, month - 1, day, 0, minutes);
	};

	const dayLabelText = (day: AvailabilityEditorDay) =>
		dayFormatter.format(dateAt(day.date, 12 * 60));

	const rangeText = (date: string, range: DayTimeRange) =>
		`${timeFormatter.format(dateAt(date, range.start))} – ${timeFormatter.format(dateAt(date, range.end))}`;

	const minutesAt = (dayIndex: number, clientX: number) => {
		const track = trackRefs.current[dayIndex];
		if (!track) return trackStart;

		const rect = track.getBoundingClientRect();
		const fraction = Math.min(
			Math.max((clientX - rect.left) / rect.width, 0),
			1,
		);

		return trackStart + fraction * (trackEnd - trackStart);
	};

	const pxToMinutes = (dayIndex: number, px: number) => {
		const track = trackRefs.current[dayIndex];
		if (!track) return 0;

		return (px / track.getBoundingClientRect().width) * (trackEnd - trackStart);
	};

	const dayIndexAt = (clientY: number) => {
		let closest = 0;
		let closestDistance = Number.POSITIVE_INFINITY;

		for (const [index, track] of trackRefs.current.entries()) {
			if (!track) continue;

			const rect = track.getBoundingClientRect();
			const center = rect.top + rect.height / 2;
			const distance = Math.abs(clientY - center);

			if (distance < closestDistance) {
				closest = index;
				closestDistance = distance;
			}
		}

		return closest;
	};

	const applyGesture = (next: Gesture | null) => {
		gestureRef.current = next;
		setGesture(next);
	};

	const trackArgs = { trackStart, trackEnd };

	const replaceDayRanges = (dayIndex: number, ranges: Array<DayTimeRange>) => {
		onChange(
			value.map((day, index) =>
				index === dayIndex ? { ...day, ranges } : day,
			),
		);
	};

	const handleTrackPointerDown =
		(dayIndex: number) => (event: React.PointerEvent<HTMLDivElement>) => {
			if (event.button !== 0) return;
			if (event.target !== event.currentTarget) return;
			if (gestureRef.current) return;

			event.currentTarget.setPointerCapture(event.pointerId);
			applyGesture({
				type: "paint",
				dayIndex,
				anchor: minutesAt(dayIndex, event.clientX),
				range: null,
			});
		};

	const handleBarPointerDown =
		(dayIndex: number, range: DayTimeRange) =>
		(event: React.PointerEvent<HTMLButtonElement>) => {
			if (event.button !== 0) return;
			if (gestureRef.current) return;

			event.stopPropagation();
			event.currentTarget.setPointerCapture(event.pointerId);
			applyGesture({
				type: "move",
				dayIndex,
				original: range,
				range,
				startClientX: event.clientX,
				moved: false,
			});
		};

	const handleResizePointerDown =
		(dayIndex: number, range: DayTimeRange, edge: "start" | "end") =>
		(event: React.PointerEvent<HTMLSpanElement>) => {
			if (event.button !== 0) return;
			if (gestureRef.current) return;

			event.stopPropagation();
			event.currentTarget.setPointerCapture(event.pointerId);
			applyGesture({ type: "resize", dayIndex, original: range, edge, range });
		};

	const handleFillPointerDown =
		(dayIndex: number, range: DayTimeRange) =>
		(event: React.PointerEvent<HTMLSpanElement>) => {
			if (event.button !== 0) return;
			if (gestureRef.current) return;

			event.stopPropagation();
			event.currentTarget.setPointerCapture(event.pointerId);
			applyGesture({ type: "fill", dayIndex, range, targetDayIndex: dayIndex });
		};

	const handleGestureMove = (event: React.PointerEvent) => {
		const current = gestureRef.current;
		if (!current) return;

		switch (current.type) {
			case "paint": {
				applyGesture({
					...current,
					range: Availability.paintedRange({
						anchor: current.anchor,
						cursor: minutesAt(current.dayIndex, event.clientX),
						walls: wallsOf(value[current.dayIndex].date),
						...trackArgs,
					}),
				});
				break;
			}
			case "move": {
				const moved =
					current.moved ||
					Math.abs(event.clientX - current.startClientX) > MOVE_THRESHOLD_PX;
				if (!moved) return;

				applyGesture({
					...current,
					moved,
					range: Availability.movedRange({
						range: current.original,
						delta: pxToMinutes(
							current.dayIndex,
							event.clientX - current.startClientX,
						),
						...trackArgs,
					}),
				});
				break;
			}
			case "resize": {
				applyGesture({
					...current,
					range: Availability.resizedRange({
						range: current.original,
						edge: current.edge,
						cursor: minutesAt(current.dayIndex, event.clientX),
						...trackArgs,
					}),
				});
				break;
			}
			case "fill": {
				applyGesture({ ...current, targetDayIndex: dayIndexAt(event.clientY) });
				break;
			}
		}
	};

	const handleGestureEnd = () => {
		const current = gestureRef.current;
		if (!current) return;

		if (current.type === "paint" && current.range) {
			const painted = current.range;
			replaceDayRanges(
				current.dayIndex,
				Availability.mergedDayRanges([
					...value[current.dayIndex].ranges,
					painted,
				]),
			);
		} else if (
			(current.type === "move" && current.moved) ||
			current.type === "resize"
		) {
			suppressClickRef.current = true;
			replaceDayRanges(
				current.dayIndex,
				Availability.mergedDayRanges([
					...value[current.dayIndex].ranges.filter(
						(range) => !sameRange(range, current.original),
					),
					current.range,
				]),
			);
		} else if (current.type === "fill") {
			suppressClickRef.current = true;
			onChange(
				value.map((day, index) => {
					if (
						index === current.dayIndex ||
						!isBetween(index, current.dayIndex, current.targetDayIndex)
					) {
						return day;
					}

					return {
						...day,
						ranges: Availability.mergedDayRanges([
							...day.ranges,
							current.range,
						]),
					};
				}),
			);
		}

		applyGesture(null);
	};

	const handleGestureCancel = () => applyGesture(null);

	const openDayEditor = (date: string, anchor: HTMLElement, addRow = false) => {
		popoverAnchorRef.current = anchor;
		dayDraftRef.current = null;
		setOpenDayDate(date);
		setOpenDayAddRow(addRow);
	};

	const applyDayDraft = (date: string, draft: DayDraft) => {
		onChange(
			value.map((day) =>
				day.date === date
					? {
							...day,
							ranges: Availability.mergedDayRanges(
								draft.ranges
									.filter((range) => range.start && range.end)
									.map((range) =>
										Availability.dayRangeFromTimes(range.start, range.end),
									),
							),
							note: draft.note.trim(),
						}
					: day,
			),
		);
	};

	const closeDayEditor = () => {
		const draft = dayDraftRef.current;

		if (draft && openDayDate) {
			applyDayDraft(openDayDate, draft);
		}

		dayDraftRef.current = null;
		setOpenDayDate(null);
	};

	// deleting commits right away so the bar disappears as the button is
	// pressed; once no ranges are left the popover has nothing to edit and
	// closes too
	const handleRangeDelete = (draft: DayDraft) => {
		if (!openDayDate) return;

		applyDayDraft(openDayDate, draft);

		if (draft.ranges.every((range) => !range.start || !range.end)) {
			dayDraftRef.current = null;
			setOpenDayDate(null);
		} else {
			dayDraftRef.current = draft;
		}
	};

	const handleBarClick = (
		date: string,
		event: React.MouseEvent<HTMLElement>,
	) => {
		if (suppressClickRef.current) {
			suppressClickRef.current = false;
			return;
		}

		openDayEditor(date, event.currentTarget);
	};

	const axisHours: Array<number> = [];
	for (
		let hour = trackStart / 60;
		hour <= trackEnd / 60;
		hour += AXIS_LABEL_EVERY_HOURS
	) {
		axisHours.push(hour);
	}

	const openDay = value.find((day) => day.date === openDayDate);

	const dayRow = (day: AvailabilityEditorDay, dayIndex: number) => {
		const dayCommitments = commitments.filter(
			(commitment) => commitment.date === day.date,
		);
		const dayGesture =
			gesture && gesture.type !== "fill" && gesture.dayIndex === dayIndex
				? gesture
				: null;
		// a plain click on a bar starts a move gesture too; the live time label
		// only belongs to an actual drag, not to the click opening the popover
		const liveRange =
			dayGesture?.type === "move" && !dayGesture.moved
				? null
				: (dayGesture?.range ?? null);
		const fillPreview =
			gesture?.type === "fill" &&
			gesture.dayIndex !== dayIndex &&
			isBetween(dayIndex, gesture.dayIndex, gesture.targetDayIndex)
				? [gesture.range]
				: [];

		return (
			<React.Fragment key={day.date}>
				<div className={styles.dayLabel}>
					{dayLabelText(day)}
					{day.note ? (
						<Flag className={styles.noteFlag} size={12} aria-hidden />
					) : null}
				</div>
				<div
					ref={(element) => {
						trackRefs.current[dayIndex] = element;
					}}
					className={styles.track}
					onPointerDown={handleTrackPointerDown(dayIndex)}
					onPointerMove={handleGestureMove}
					onPointerUp={handleGestureEnd}
					onPointerCancel={handleGestureCancel}
				>
					{axisHours
						.filter((hour) => hour * 60 > trackStart && hour * 60 < trackEnd)
						.map((hour) => (
							<div
								key={hour}
								className={clsx(styles.tick, {
									[styles.tickMidnight]: hour === 24,
								})}
								style={{ left: `${pct(hour * 60)}%` }}
							/>
						))}
					{dayCommitments.map((commitment) => (
						<div
							key={`${commitment.range.start}-${commitment.name}`}
							className={styles.commitment}
							style={barStyle(commitment.range)}
							title={commitment.name}
						>
							<span className={styles.commitmentName}>{commitment.name}</span>
						</div>
					))}
					{day.ranges.map((range) => {
						const isDragged =
							(dayGesture?.type === "move" || dayGesture?.type === "resize") &&
							sameRange(range, dayGesture.original);
						const shown = isDragged && dayGesture ? dayGesture.range : range;

						return (
							<button
								type="button"
								key={`${range.start}-${range.end}`}
								className={styles.bar}
								style={barStyle(shown)}
								data-testid="availability-bar"
								aria-label={`${t("schedule:editor.editDay", {
									day: dayLabelText(day),
								})} (${rangeText(day.date, range)})`}
								title={rangeText(day.date, shown)}
								onPointerDown={handleBarPointerDown(dayIndex, range)}
								onClick={(event) => handleBarClick(day.date, event)}
							>
								<span className={styles.barTimes}>
									{rangeText(day.date, shown)}
								</span>
								<span className={styles.barTimesShort}>
									{timeFormatter.format(dateAt(day.date, shown.start))}
								</span>
								<span
									className={clsx(styles.handle, styles.handleStart)}
									onPointerDown={handleResizePointerDown(
										dayIndex,
										range,
										"start",
									)}
								/>
								<span
									className={clsx(styles.handle, styles.handleEnd)}
									onPointerDown={handleResizePointerDown(
										dayIndex,
										range,
										"end",
									)}
								/>
								<span
									className={styles.fillHandle}
									onPointerDown={handleFillPointerDown(dayIndex, range)}
								/>
							</button>
						);
					})}
					{gesture?.type === "paint" &&
					gesture.dayIndex === dayIndex &&
					gesture.range ? (
						<div
							className={clsx(styles.bar, styles.barPreview)}
							style={barStyle(gesture.range)}
						/>
					) : null}
					{fillPreview.map((piece) => (
						<div
							key={`${piece.start}-${piece.end}`}
							className={clsx(styles.bar, styles.barPreview)}
							style={barStyle(piece)}
						/>
					))}
					{liveRange ? (
						<span
							className={styles.liveLabel}
							style={{ left: `${pct(liveRange.start)}%` }}
						>
							{rangeText(day.date, liveRange)}
						</span>
					) : null}
				</div>
				<button
					type="button"
					className={styles.editButton}
					data-testid={`availability-day-edit-${dayIndex}`}
					aria-label={t("schedule:editor.editDay", { day: dayLabelText(day) })}
					onClick={(event) => openDayEditor(day.date, event.currentTarget)}
				>
					<SquarePen size={14} aria-hidden />
				</button>
			</React.Fragment>
		);
	};

	return (
		<div className={styles.container}>
			<div className={styles.editor}>
				<div className={styles.tracks}>
					<button
						type="button"
						className={clsx(styles.axisToggle, styles.axisLead)}
						onClick={() => setEarlierShown(!earlierShown)}
					>
						{earlierShown ? (
							<ChevronRight size={12} aria-hidden />
						) : (
							<ChevronLeft size={12} aria-hidden />
						)}
						{t("schedule:editor.earlier")}
					</button>
					<div className={styles.axis}>
						{axisHours.map((hour) => (
							<span
								key={hour}
								className={clsx(styles.axisLabel, {
									[styles.axisLabelFirst]: hour * 60 === trackStart,
									[styles.axisLabelLast]: hour * 60 === trackEnd,
								})}
								style={{ left: `${pct(hour * 60)}%` }}
							>
								{hourFormatter.format(dateAt(value[0].date, hour * 60))}
							</span>
						))}
					</div>
					<button
						type="button"
						className={clsx(styles.axisToggle, styles.axisTrail)}
						onClick={() => setLaterShown(!laterShown)}
					>
						{t("schedule:editor.later")}
						{laterShown ? (
							<ChevronLeft size={12} aria-hidden />
						) : (
							<ChevronRight size={12} aria-hidden />
						)}
					</button>
					{value.map((day, dayIndex) => dayRow(day, dayIndex))}
				</div>
				<div className={styles.list}>
					{value.map((day) => {
						const dayCommitments = commitments.filter(
							(commitment) => commitment.date === day.date,
						);

						return (
							<div key={day.date} className={styles.listDay}>
								<div className={styles.listDayHeader}>{dayLabelText(day)}</div>
								<div className={styles.listDayBody}>
									{day.ranges.map((range) => (
										<button
											type="button"
											key={`${range.start}-${range.end}`}
											className={styles.timeChip}
											onClick={(event) =>
												openDayEditor(day.date, event.currentTarget)
											}
										>
											{rangeText(day.date, range)}
										</button>
									))}
									{dayCommitments.map((commitment) => (
										<span
											key={`${commitment.range.start}-${commitment.name}`}
											className={styles.commitmentChip}
										>
											{commitment.name} ·{" "}
											{rangeText(day.date, commitment.range)}
										</span>
									))}
									<button
										type="button"
										className={styles.addChip}
										onClick={(event) =>
											openDayEditor(day.date, event.currentTarget, true)
										}
									>
										<Plus size={14} aria-hidden />
										{t("schedule:editor.addTime")}
									</button>
								</div>
								{day.note ? (
									<div className={styles.listNote}>
										<Flag size={12} aria-hidden className={styles.noteFlag} />
										{day.note}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
				<p className={styles.footer}>
					{t("schedule:editor.timesInYourTimezone")} ·{" "}
					{t("schedule:editor.visibility")}
				</p>
			</div>
			{openDay ? (
				<SendouAnchoredPopover
					isOpen
					onOpenChange={(isOpen) => {
						if (!isOpen) closeDayEditor();
					}}
					triggerRef={popoverAnchorRef}
				>
					<DayEditor
						day={openDay}
						dayLabel={dayLabelText(openDay)}
						startWithNewRow={openDayAddRow}
						onDraftChange={(draft) => {
							dayDraftRef.current = draft;
						}}
						onRangeDelete={handleRangeDelete}
					/>
				</SendouAnchoredPopover>
			) : null}
		</div>
	);
}

function DayEditor({
	day,
	dayLabel,
	startWithNewRow,
	onDraftChange,
	onRangeDelete,
}: {
	day: AvailabilityEditorDay;
	dayLabel: string;
	/** Opens with an empty row already appended, for an "add time" entry point. */
	startWithNewRow: boolean;
	onDraftChange: (draft: DayDraft) => void;
	/** Called with the remaining draft after a range row is deleted — deletes commit instantly instead of waiting for the popover to close. */
	onRangeDelete: (draft: DayDraft) => void;
}) {
	const { t } = useTranslation(["schedule", "common", "forms"]);
	const noteId = React.useId();
	const nextIdRef = React.useRef(day.ranges.length + 1);
	const [ranges, setRanges] = React.useState<Array<DraftRange>>(() => {
		const existing = day.ranges.map((range, index) => ({
			id: index,
			start: Availability.minutesToTime(range.start),
			end: Availability.minutesToTime(range.end),
		}));

		return startWithNewRow || existing.length === 0
			? [...existing, { id: existing.length, start: "", end: "" }]
			: existing;
	});
	const [note, setNote] = React.useState(day.note);

	const update = (nextRanges: Array<DraftRange>, nextNote: string) => {
		setRanges(nextRanges);
		setNote(nextNote);
		onDraftChange({ ranges: nextRanges, note: nextNote });
	};

	return (
		<div className={styles.dayEditor}>
			<div className={styles.dayEditorTitle}>{dayLabel}</div>
			{ranges.map((range) => (
				<div key={range.id} className={styles.dayEditorRange}>
					<TimeRangeFormField
						name={`range-${range.id}`}
						value={{ start: range.start, end: range.end }}
						onChange={(next) =>
							update(
								ranges.map((other) =>
									other.id === range.id
										? {
												...other,
												start: next?.start ?? "",
												end: next?.end ?? "",
											}
										: other,
								),
								note,
							)
						}
						startLabel={t("forms:labels.start")}
						endLabel={t("forms:labels.end")}
					/>
					<SendouButton
						icon={<Trash />}
						variant="minimal-destructive"
						size="small"
						aria-label={t("common:actions.delete")}
						onPress={() => {
							const remaining = ranges.filter((other) => other.id !== range.id);
							update(remaining, note);
							onRangeDelete({ ranges: remaining, note });
						}}
					/>
				</div>
			))}
			<SendouButton
				icon={<Plus />}
				variant="minimal"
				size="small"
				className={styles.dayEditorAdd}
				onPress={() => {
					const id = nextIdRef.current;
					nextIdRef.current += 1;
					update([...ranges, { id, start: "", end: "" }], note);
				}}
			>
				{t("schedule:editor.addTime")}
			</SendouButton>
			<div>
				<Label
					htmlFor={noteId}
					valueLimits={{
						current: note.length,
						max: AVAILABILITY.DAY_NOTE_MAX_LENGTH,
					}}
				>
					{t("schedule:editor.note")}
				</Label>
				<Input
					id={noteId}
					value={note}
					maxLength={AVAILABILITY.DAY_NOTE_MAX_LENGTH}
					onChange={(event) => update(ranges, event.target.value)}
				/>
			</div>
		</div>
	);
}

const sameRange = (one: DayTimeRange, other: DayTimeRange) =>
	one.start === other.start && one.end === other.end;

const isBetween = (index: number, one: number, other: number) =>
	index >= Math.min(one, other) && index <= Math.max(one, other);
