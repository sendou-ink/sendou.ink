import { Calendar } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouBottomTexts } from "~/components/elements/BottomTexts";
import { SendouCalendar } from "~/components/elements/Calendar";
import styles from "./DatePicker.module.css";
import { SendouLabel } from "./Label";
import { useAnchorSafeId } from "./Popover";

/**
 * Handrolled date(+time) editor: a row of editable segments plus a calendar
 * popover. Each editable segment is a `spinbutton` whose accessible name is
 * `"{segment}, {label}"`.
 */

type EditableSegmentType =
	| "month"
	| "day"
	| "year"
	| "hour"
	| "minute"
	| "dayPeriod";

type Segment =
	| { type: EditableSegmentType }
	| { type: "literal"; text: string };

interface Parts {
	year: number | null;
	month: number | null;
	day: number | null;
	hour12: number | null;
	minute: number | null;
	dayPeriod: "AM" | "PM" | null;
}

const SEGMENT_ARIA_NAMES: Record<EditableSegmentType, string> = {
	month: "month",
	day: "day",
	year: "year",
	hour: "hour",
	minute: "minute",
	dayPeriod: "AM/PM",
};

const SEGMENT_LIMITS: Record<
	Exclude<EditableSegmentType, "dayPeriod">,
	{ min: number; max: number; digits: number }
> = {
	year: { min: 1, max: 9999, digits: 4 },
	month: { min: 1, max: 12, digits: 2 },
	day: { min: 1, max: 31, digits: 2 },
	hour: { min: 1, max: 12, digits: 2 },
	minute: { min: 0, max: 59, digits: 2 },
};

const PLACEHOLDERS: Record<EditableSegmentType, string> = {
	month: "mm",
	day: "dd",
	year: "yyyy",
	hour: "––",
	minute: "––",
	dayPeriod: "AM",
};

interface SendouDatePickerProps {
	label: string;
	value: Date | null;
	onChange: (value: Date | null) => void;
	granularity?: "day" | "minute";
	bottomText?: string;
	errorText?: string;
	errorId?: string;
	isRequired?: boolean;
	isDisabled?: boolean;
	onBlur?: () => void;
}

export function SendouDatePicker({
	label,
	value,
	onChange,
	granularity = "minute",
	bottomText,
	errorText,
	errorId,
	isRequired,
	isDisabled,
	onBlur,
}: SendouDatePickerProps) {
	const { i18n } = useTranslation();
	const uid = useAnchorSafeId();
	const anchorName = `--datepicker-anchor-${uid}`;
	const popoverId = `${uid}-calendar-popover`;

	const [parts, setParts] = React.useState<Parts>(() => partsFromDate(value));
	const lastEmittedRef = React.useRef<number | null>(value?.getTime() ?? null);
	const enteredRef = React.useRef("");

	// external value changes (e.g. a form reset) re-seed the segments; edits
	// round-trip through `lastEmittedRef` so they don't clobber a partial entry
	const incoming = value?.getTime() ?? null;
	if (incoming !== lastEmittedRef.current) {
		lastEmittedRef.current = incoming;
		setParts(partsFromDate(value));
	}

	const [calendarOpen, setCalendarOpen] = React.useState(false);
	const calendarPopoverRef = React.useRef<HTMLDivElement>(null);

	const segments = buildSegments(granularity, i18n.language);
	const editableSegments = segments.filter(
		(segment): segment is { type: EditableSegmentType } =>
			segment.type !== "literal",
	);

	const segmentValue = (type: EditableSegmentType, from: Parts = parts) => {
		switch (type) {
			case "year":
				return from.year;
			case "month":
				return from.month;
			case "day":
				return from.day;
			case "hour":
				return from.hour12;
			case "minute":
				return from.minute;
			case "dayPeriod":
				return from.dayPeriod;
		}
	};

	const segmentText = (type: EditableSegmentType) => {
		const segValue = segmentValue(type);
		if (segValue === null) return PLACEHOLDERS[type];
		if (type === "minute") return String(segValue).padStart(2, "0");
		if (type === "year") return String(segValue).padStart(4, "0");
		return String(segValue);
	};

	const emitIfComplete = (next: Parts) => {
		const timeComplete =
			granularity === "day" ||
			(next.hour12 !== null && next.minute !== null && next.dayPeriod !== null);

		if (
			next.year === null ||
			next.month === null ||
			next.day === null ||
			!timeComplete
		) {
			if (lastEmittedRef.current !== null) {
				lastEmittedRef.current = null;
				onChange(null);
			}
			return;
		}

		const hour24 =
			granularity === "day"
				? 0
				: next.dayPeriod === "PM"
					? ((next.hour12 as number) % 12) + 12
					: (next.hour12 as number) % 12;

		const date = new Date(
			next.year,
			next.month - 1,
			next.day,
			hour24,
			granularity === "day" ? 0 : (next.minute ?? 0),
		);
		if (date.getTime() === lastEmittedRef.current) return;
		lastEmittedRef.current = date.getTime();
		onChange(date);
	};

	const applyParts = (updates: Partial<Parts>) => {
		const next = { ...parts, ...updates };
		setParts(next);
		emitIfComplete(next);
		return next;
	};

	const setSegmentValue = (
		type: EditableSegmentType,
		value_: number | string,
	) => {
		switch (type) {
			case "year":
			case "month":
			case "day":
			case "minute":
				applyParts({ [type]: value_ as number });
				break;
			case "hour":
				applyParts({ hour12: value_ as number });
				break;
			case "dayPeriod":
				applyParts({ dayPeriod: value_ as "AM" | "PM" });
				break;
		}
	};

	const clearSegmentValue = (type: EditableSegmentType) => {
		enteredRef.current = "";
		if (type === "dayPeriod") {
			applyParts({ dayPeriod: null });
		} else if (type === "hour") {
			applyParts({ hour12: null });
		} else {
			applyParts({ [type]: null });
		}
	};

	const handleChar = (type: EditableSegmentType, char: string) => {
		if (type === "dayPeriod") {
			const lower = char.toLowerCase();
			if (lower === "a") setSegmentValue(type, "AM");
			if (lower === "p") setSegmentValue(type, "PM");
			return;
		}

		if (!/\d/.test(char)) return;

		const limits = SEGMENT_LIMITS[type];
		let next = enteredRef.current + char;
		if (Number(next) > limits.max) {
			next = char;
		}
		enteredRef.current = next;
		setSegmentValue(type, Number(next));

		const cannotAcceptAnotherDigit =
			next.length >= limits.digits || Number(next) * 10 > limits.max;
		if (cannotAcceptAnotherDigit) {
			enteredRef.current = "";
			focusAdjacentSegment(type, 1);
		}
	};

	// a native listener: React's synthetic onBeforeInput misses `insertText`
	// edits coming from execCommand (e.g. automated fills)
	const handleBeforeInput = (type: EditableSegmentType, event: InputEvent) => {
		event.preventDefault();

		if (event.inputType === "insertText" && event.data) {
			for (const char of event.data) {
				handleChar(type, char);
			}
			return;
		}

		if (event.inputType.startsWith("delete")) {
			clearSegmentValue(type);
		}
	};

	const stepSegment = (type: EditableSegmentType, direction: 1 | -1) => {
		if (type === "dayPeriod") {
			setSegmentValue(type, parts.dayPeriod === "PM" ? "AM" : "PM");
			return;
		}

		const limits = SEGMENT_LIMITS[type];
		const current = segmentValue(type) as number | null;
		const base = current ?? (direction === 1 ? limits.min - 1 : limits.min);
		let next = base + direction;
		if (next > limits.max) next = limits.min;
		if (next < limits.min) next = limits.max;
		setSegmentValue(type, next);
	};

	const handleKeyDown = (
		type: EditableSegmentType,
		event: React.KeyboardEvent,
	) => {
		switch (event.key) {
			case "ArrowUp":
				event.preventDefault();
				enteredRef.current = "";
				stepSegment(type, 1);
				return;
			case "ArrowDown":
				event.preventDefault();
				enteredRef.current = "";
				stepSegment(type, -1);
				return;
			case "ArrowLeft":
				event.preventDefault();
				focusAdjacentSegment(type, -1);
				return;
			case "ArrowRight":
				event.preventDefault();
				focusAdjacentSegment(type, 1);
				return;
			case "Backspace":
			case "Delete":
				event.preventDefault();
				clearSegmentValue(type);
				return;
			default:
				return;
		}
	};

	const segmentId = (type: EditableSegmentType) => `${uid}-segment-${type}`;

	const focusAdjacentSegment = (
		type: EditableSegmentType,
		direction: 1 | -1,
	) => {
		const index = editableSegments.findIndex(
			(segment) => segment.type === type,
		);
		const target = editableSegments[index + direction];
		if (!target) return;

		document.getElementById(segmentId(target.type))?.focus();
	};

	const segmentAriaValue = (type: EditableSegmentType) => {
		const segValue = segmentValue(type);
		if (type === "dayPeriod") {
			return {
				now: segValue === null ? undefined : segValue === "AM" ? 0 : 1,
				text: segValue === null ? "Empty" : String(segValue),
				min: 0,
				max: 1,
			};
		}
		const limits = SEGMENT_LIMITS[type];
		return {
			now: segValue === null ? undefined : (segValue as number),
			text: segValue === null ? "Empty" : String(segValue),
			min: limits.min,
			max: limits.max,
		};
	};

	const openCalendar = () => {
		calendarPopoverRef.current?.showPopover();
	};

	const pickCalendarDay = (date: Date) => {
		const updates: Partial<Parts> = {
			year: date.getFullYear(),
			month: date.getMonth() + 1,
			day: date.getDate(),
		};
		if (granularity === "minute" && parts.hour12 === null) {
			updates.hour12 = 12;
			updates.minute = 0;
			updates.dayPeriod = "PM";
		}
		applyParts(updates);
		calendarPopoverRef.current?.hidePopover();
	};

	const selectedCalendarDate =
		parts.year !== null && parts.month !== null && parts.day !== null
			? new Date(parts.year, parts.month - 1, parts.day)
			: null;

	return (
		<div className={styles.root} data-open={calendarOpen || undefined}>
			<SendouLabel required={isRequired}>{label}</SendouLabel>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: only observes focus leaving the group */}
			<div
				className={styles.group}
				style={{ anchorName } as React.CSSProperties}
				onBlur={(event) => {
					if (
						event.relatedTarget instanceof Node &&
						event.currentTarget.contains(event.relatedTarget)
					) {
						return;
					}
					onBlur?.();
				}}
			>
				{/* biome-ignore lint/a11y/useSemanticElements: a fieldset would break the field-look layout */}
				<div className={styles.dateInput} role="group" aria-label={label}>
					{segments.map((segment, index) =>
						segment.type === "literal" ? (
							<div
								key={index}
								className={styles.segment}
								data-type="literal"
								aria-hidden="true"
							>
								{segment.text}
							</div>
						) : (
							<EditableSegment
								key={segment.type}
								type={segment.type}
								id={segmentId(segment.type)}
								label={label}
								isDisabled={isDisabled}
								text={segmentText(segment.type)}
								isPlaceholder={segmentValue(segment.type) === null}
								aria={segmentAriaValue(segment.type)}
								onBeforeInput={handleBeforeInput}
								onKeyDown={handleKeyDown}
								onFocusChange={() => {
									enteredRef.current = "";
								}}
							/>
						),
					)}
				</div>
				<button
					type="button"
					data-testid="open-calendar-button"
					className={styles.button}
					popoverTarget={popoverId}
					disabled={isDisabled}
					aria-label="Open calendar"
					onClick={openCalendar}
				>
					<Calendar className={styles.icon} />
				</button>
			</div>
			<SendouBottomTexts
				bottomText={bottomText}
				errorText={errorText}
				errorId={errorId}
			/>
			<div
				ref={calendarPopoverRef}
				id={popoverId}
				popover="auto"
				className={styles.calendarPopover}
				style={{ positionAnchor: anchorName } as React.CSSProperties}
				onToggle={(event) => setCalendarOpen(event.newState === "open")}
			>
				{calendarOpen ? (
					<SendouCalendar
						value={selectedCalendarDate}
						onChange={pickCalendarDay}
					/>
				) : null}
			</div>
		</div>
	);
}

function EditableSegment({
	type,
	id,
	label,
	isDisabled,
	text,
	isPlaceholder,
	aria,
	onBeforeInput,
	onKeyDown,
	onFocusChange,
}: {
	type: EditableSegmentType;
	id: string;
	label: string;
	isDisabled?: boolean;
	text: string;
	isPlaceholder: boolean;
	aria: { now?: number; text: string; min: number; max: number };
	onBeforeInput: (type: EditableSegmentType, event: InputEvent) => void;
	onKeyDown: (type: EditableSegmentType, event: React.KeyboardEvent) => void;
	onFocusChange: () => void;
}) {
	const beforeInputRef = React.useRef<(event: InputEvent) => void>(null);
	beforeInputRef.current = (event) => onBeforeInput(type, event);

	return (
		<div
			ref={(element) => {
				if (!element) return;
				const listener = (event: Event) =>
					beforeInputRef.current?.(event as InputEvent);
				element.addEventListener("beforeinput", listener);
				return () => element.removeEventListener("beforeinput", listener);
			}}
			className={styles.segment}
			id={id}
			role="spinbutton"
			contentEditable={!isDisabled}
			suppressContentEditableWarning
			spellCheck={false}
			autoCapitalize="off"
			inputMode="numeric"
			enterKeyHint="next"
			tabIndex={isDisabled ? undefined : 0}
			data-type={type}
			data-placeholder={isPlaceholder || undefined}
			aria-label={`${SEGMENT_ARIA_NAMES[type]}, ${label}`}
			aria-valuenow={aria.now}
			aria-valuetext={aria.text}
			aria-valuemin={aria.min}
			aria-valuemax={aria.max}
			onKeyDown={(event) => onKeyDown(type, event)}
			onFocus={onFocusChange}
			onBlur={onFocusChange}
		>
			{text}
		</div>
	);
}

const segmentsCache = new Map<string, Segment[]>();

function buildSegments(gran: "day" | "minute", locale: string): Segment[] {
	const cacheKey = `${gran}-${locale}`;
	const cached = segmentsCache.get(cacheKey);
	if (cached) return cached;

	const formatter = new Intl.DateTimeFormat(locale, {
		year: "numeric",
		month: "numeric",
		day: "numeric",
		...(gran === "minute"
			? { hour: "numeric", minute: "2-digit", hour12: true }
			: {}),
	});

	const segments = formatter
		.formatToParts(new Date(2020, 0, 15, 15, 30))
		.map((part): Segment | null => {
			switch (part.type) {
				case "year":
				case "month":
				case "day":
				case "hour":
				case "minute":
				case "dayPeriod":
					return { type: part.type };
				case "literal":
					return { type: "literal", text: part.value };
				default:
					return null;
			}
		})
		.filter((segment) => segment !== null);
	segmentsCache.set(cacheKey, segments);
	return segments;
}

function partsFromDate(date: Date | null): Parts {
	if (!date || Number.isNaN(date.getTime())) {
		return {
			year: null,
			month: null,
			day: null,
			hour12: null,
			minute: null,
			dayPeriod: null,
		};
	}
	const hours = date.getHours();
	return {
		year: date.getFullYear(),
		month: date.getMonth() + 1,
		day: date.getDate(),
		hour12: hours % 12 || 12,
		minute: date.getMinutes(),
		dayPeriod: hours >= 12 ? "PM" : "AM",
	};
}
