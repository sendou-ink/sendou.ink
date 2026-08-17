<script lang="ts">
import { getLocale } from "#lib/paraglide/runtime.js";
import FormMessage from "./FormMessage.svelte";
import Label from "./Label.svelte";

/**
 * Handrolled replacement for react-aria's DatePicker: a segmented date(+time)
 * editor plus a calendar popover. Each editable segment is a `spinbutton`
 * whose accessible name is `"{segment}, {label}"`, matching what the e2e form
 * helpers (and screen reader users) expect from the React app.
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

interface Props {
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

let {
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
}: Props = $props();

const uid = $props.id();

interface Parts {
	year: number | null;
	month: number | null;
	day: number | null;
	hour12: number | null;
	minute: number | null;
	dayPeriod: "AM" | "PM" | null;
}

// svelte-ignore state_referenced_locally -- the prop seeds the initial segments only
let parts = $state<Parts>(partsFromDate(value));
// svelte-ignore state_referenced_locally -- the prop seeds the initial round-trip marker only
let lastEmittedTime: number | null = value?.getTime() ?? null;

// external value changes (e.g. a calendar pick elsewhere or a form reset)
// re-seed the segments; edits round-trip through `lastEmittedTime` so they
// don't clobber a partial entry
$effect(() => {
	const incoming = value?.getTime() ?? null;
	if (incoming === lastEmittedTime) return;
	lastEmittedTime = incoming;
	parts = partsFromDate(value);
});

let entered = "";
let calendarOpen = $state(false);
let calendarPopover = $state<HTMLDivElement | null>(null);
let calendarViewYear = $state(new Date().getFullYear());
let calendarViewMonth = $state(new Date().getMonth());

// svelte-ignore state_referenced_locally -- the segment layout is fixed at mount
const segments: Segment[] = buildSegments(granularity);

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

function buildSegments(gran: "day" | "minute"): Segment[] {
	const formatter = new Intl.DateTimeFormat(getLocale(), {
		year: "numeric",
		month: "numeric",
		day: "numeric",
		...(gran === "minute"
			? { hour: "numeric", minute: "2-digit", hour12: true }
			: {}),
	});

	return formatter
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

function segmentValue(type: EditableSegmentType): number | string | null {
	switch (type) {
		case "year":
			return parts.year;
		case "month":
			return parts.month;
		case "day":
			return parts.day;
		case "hour":
			return parts.hour12;
		case "minute":
			return parts.minute;
		case "dayPeriod":
			return parts.dayPeriod;
	}
}

function segmentText(type: EditableSegmentType): string {
	const segValue = segmentValue(type);
	if (segValue === null) return PLACEHOLDERS[type];
	if (type === "dayPeriod") return String(segValue);
	if (type === "hour") return String(segValue);
	if (type === "year") return String(segValue).padStart(4, "0");
	return String(segValue).padStart(2, "0");
}

function setSegmentValue(type: EditableSegmentType, next: number | string) {
	switch (type) {
		case "year":
			parts.year = next as number;
			break;
		case "month":
			parts.month = next as number;
			break;
		case "day":
			parts.day = next as number;
			break;
		case "hour":
			parts.hour12 = next as number;
			break;
		case "minute":
			parts.minute = next as number;
			break;
		case "dayPeriod":
			parts.dayPeriod = next as "AM" | "PM";
			break;
	}
	emitIfComplete();
}

function clearSegmentValue(type: EditableSegmentType) {
	if (type === "dayPeriod") {
		parts.dayPeriod = null;
	} else if (type === "hour") {
		parts.hour12 = null;
	} else {
		parts[type] = null;
	}
	entered = "";
	emitIfComplete();
}

function emitIfComplete() {
	const timeComplete =
		granularity === "day" ||
		(parts.hour12 !== null &&
			parts.minute !== null &&
			parts.dayPeriod !== null);

	if (
		parts.year === null ||
		parts.month === null ||
		parts.day === null ||
		!timeComplete
	) {
		if (lastEmittedTime !== null) {
			lastEmittedTime = null;
			onChange(null);
		}
		return;
	}

	const hour24 =
		granularity === "day"
			? 0
			: parts.dayPeriod === "PM"
				? (parts.hour12! % 12) + 12
				: parts.hour12! % 12;

	const date = new Date(
		parts.year,
		parts.month - 1,
		parts.day,
		hour24,
		granularity === "day" ? 0 : (parts.minute ?? 0),
	);
	if (date.getTime() === lastEmittedTime) return;
	lastEmittedTime = date.getTime();
	onChange(date);
}

function handleChar(type: EditableSegmentType, char: string) {
	if (type === "dayPeriod") {
		const lower = char.toLowerCase();
		if (lower === "a") setSegmentValue(type, "AM");
		if (lower === "p") setSegmentValue(type, "PM");
		return;
	}

	if (!/\d/.test(char)) return;

	const limits = SEGMENT_LIMITS[type];
	let next = entered + char;
	if (Number(next) > limits.max) {
		next = char;
	}
	entered = next;
	setSegmentValue(type, Number(next));

	const cannotAcceptAnotherDigit =
		next.length >= limits.digits || Number(next) * 10 > limits.max;
	if (cannotAcceptAnotherDigit) {
		entered = "";
		focusAdjacentSegment(type, 1);
	}
}

function handleBeforeInput(type: EditableSegmentType, event: InputEvent) {
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
}

function stepSegment(type: EditableSegmentType, direction: 1 | -1) {
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
}

function handleKeydown(type: EditableSegmentType, event: KeyboardEvent) {
	switch (event.key) {
		case "ArrowUp":
			event.preventDefault();
			entered = "";
			stepSegment(type, 1);
			return;
		case "ArrowDown":
			event.preventDefault();
			entered = "";
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
}

function focusAdjacentSegment(type: EditableSegmentType, direction: 1 | -1) {
	const editable = segments.filter(
		(segment): segment is { type: EditableSegmentType } =>
			segment.type !== "literal",
	);
	const index = editable.findIndex((segment) => segment.type === type);
	const target = editable[index + direction];
	if (!target) return;

	document
		.getElementById(segmentId(target.type))
		?.focus();
}

function segmentId(type: EditableSegmentType) {
	return `${uid}-segment-${type}`;
}

function segmentAriaValue(type: EditableSegmentType) {
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
}

// --- calendar popover ---

function openCalendar() {
	const anchor = value ?? new Date();
	calendarViewYear = parts.year ?? anchor.getFullYear();
	calendarViewMonth = parts.month !== null ? parts.month - 1 : anchor.getMonth();
	calendarPopover?.showPopover();
}

function onCalendarToggle(event: Event) {
	calendarOpen = (event as ToggleEvent).newState === "open";
}

function moveCalendarMonth(offset: number) {
	const next = new Date(calendarViewYear, calendarViewMonth + offset, 1);
	calendarViewYear = next.getFullYear();
	calendarViewMonth = next.getMonth();
}

const calendarWeeks = $derived.by(() => {
	const firstOfMonth = new Date(calendarViewYear, calendarViewMonth, 1);
	const daysInMonth = new Date(
		calendarViewYear,
		calendarViewMonth + 1,
		0,
	).getDate();

	const weeks: Array<Array<number | null>> = [];
	let week: Array<number | null> = new Array(firstOfMonth.getDay()).fill(null);

	for (let day = 1; day <= daysInMonth; day++) {
		week.push(day);
		if (week.length === 7) {
			weeks.push(week);
			week = [];
		}
	}
	if (week.length > 0) {
		while (week.length < 7) week.push(null);
		weeks.push(week);
	}

	return weeks;
});

const calendarHeading = $derived(
	new Intl.DateTimeFormat(getLocale(), {
		month: "long",
		year: "numeric",
	}).format(new Date(calendarViewYear, calendarViewMonth, 1)),
);

const weekdayNames = $derived.by(() => {
	const formatter = new Intl.DateTimeFormat(getLocale(), {
		weekday: "narrow",
	});
	// 2023-01-01 was a Sunday
	return Array.from({ length: 7 }, (_, i) =>
		formatter.format(new Date(2023, 0, 1 + i)),
	);
});

function pickCalendarDay(day: number) {
	parts.year = calendarViewYear;
	parts.month = calendarViewMonth + 1;
	parts.day = day;
	if (granularity === "minute" && parts.hour12 === null) {
		parts.hour12 = 12;
		parts.minute = 0;
		parts.dayPeriod = "PM";
	}
	emitIfComplete();
	calendarPopover?.hidePopover();
}

const isSelectedCalendarDay = (day: number) =>
	parts.year === calendarViewYear &&
	parts.month === calendarViewMonth + 1 &&
	parts.day === day;

const anchorName = `--datepicker-anchor-${uid}`;
const popoverId = `${uid}-calendar-popover`;
</script>

<div class="root" data-open={calendarOpen || undefined}>
	<Label spaced={false} required={isRequired}>{label}</Label>
	<div
		class="group"
		style:anchor-name={anchorName}
		onfocusout={(event) => {
			if (
				event.relatedTarget instanceof Node &&
				event.currentTarget.contains(event.relatedTarget)
			) {
				return;
			}
			onBlur?.();
		}}
	>
		<div class="dateInput" role="group" aria-label={label}>
			{#each segments as segment, index (index)}
				{#if segment.type === "literal"}
					<div class="segment" data-type="literal" aria-hidden="true">
						{segment.text}
					</div>
				{:else}
					{@const aria = segmentAriaValue(segment.type)}
					<div
						class="segment"
						id={segmentId(segment.type)}
						role="spinbutton"
						contenteditable={!isDisabled}
						spellcheck="false"
						autocapitalize="off"
						inputmode="numeric"
						enterkeyhint="next"
						tabindex={isDisabled ? undefined : 0}
						data-type={segment.type}
						data-placeholder={segmentValue(segment.type) === null || undefined}
						aria-label={`${SEGMENT_ARIA_NAMES[segment.type]}, ${label}`}
						aria-valuenow={aria.now}
						aria-valuetext={aria.text}
						aria-valuemin={aria.min}
						aria-valuemax={aria.max}
						onbeforeinput={(event) => handleBeforeInput(segment.type, event)}
						onkeydown={(event) => handleKeydown(segment.type, event)}
						onfocus={() => {
							entered = "";
						}}
						onblur={() => {
							entered = "";
						}}
					>
						{segmentText(segment.type)}
					</div>
				{/if}
			{/each}
		</div>
		<button
			type="button"
			data-testid="open-calendar-button"
			class="button"
			popovertarget={popoverId}
			disabled={isDisabled}
			aria-label="Open calendar"
			onclick={openCalendar}
		>
			<svg
				class="icon"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M8 2v4" />
				<path d="M16 2v4" />
				<rect width="18" height="18" x="3" y="4" rx="2" />
				<path d="M3 10h18" />
			</svg>
		</button>
	</div>
	{#if errorText}
		<FormMessage type="error" spaced={false} id={errorId}>
			{errorText}
		</FormMessage>
	{/if}
	{#if bottomText}
		<FormMessage type="info" spaced={false}>{bottomText}</FormMessage>
	{/if}
	<div
		bind:this={calendarPopover}
		id={popoverId}
		popover="auto"
		class="calendarPopover"
		style:position-anchor={anchorName}
		ontoggle={onCalendarToggle}
	>
		<div class="calendar">
			<header class="calendarHeader">
				<button
					type="button"
					class="navButton"
					aria-label="Previous month"
					onclick={() => moveCalendarMonth(-1)}
				>
					<svg
						class="navIcon"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="m15 18-6-6 6-6" />
					</svg>
				</button>
				<h2 class="calendarHeading">{calendarHeading}</h2>
				<button
					type="button"
					class="navButton"
					aria-label="Next month"
					onclick={() => moveCalendarMonth(1)}
				>
					<svg
						class="navIcon"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="m9 18 6-6-6-6" />
					</svg>
				</button>
			</header>
			<table class="grid">
				<thead>
					<tr>
						{#each weekdayNames as weekday, index (index)}
							<th class="headerCell">{weekday}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each calendarWeeks as week, weekIndex (weekIndex)}
						<tr>
							{#each week as day, dayIndex (dayIndex)}
								<td>
									{#if day !== null}
										<button
											type="button"
											class="cell"
											data-testid="choose-date-button"
											data-selected={isSelectedCalendarDay(day) || undefined}
											onclick={() => pickCalendarDay(day)}
										>
											{day}
										</button>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

<style>
	.root {
		display: flex;
		flex-direction: column;
		gap: var(--s-1-5);
		width: 100%;

		&[data-open] .group {
			border-color: transparent;
			outline: var(--focus-ring);
		}
	}

	.group {
		height: var(--field-size);
		padding: 0 var(--field-padding);
		border: var(--border-style);
		border-radius: var(--radius-field);
		background-color: var(--color-bg);
		outline: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-1-5);
		width: 100%;
		cursor: pointer;
	}

	.dateInput {
		display: flex;
		font-size: var(--font-sm);
	}

	.segment {
		white-space: pre;
		caret-color: transparent;

		&:not([data-type="literal"]) {
			padding: 0 var(--s-0-5);
			border-radius: 5px;
		}

		&[data-placeholder] {
			color: var(--color-text-high);
		}

		&:focus-visible,
		&:focus {
			background-color: var(--color-bg-high);
			color: var(--color-text-accent);
			outline: none;
		}
	}

	.button {
		padding: 0;
		margin-inline-start: auto;
		background-color: transparent;
		border: none;
		outline: none;
		cursor: pointer;
		display: flex;
	}

	.icon {
		color: var(--color-text-high);
		width: var(--field-size-icon);
		height: var(--field-size-icon);
	}

	.calendarPopover {
		position: fixed;
		position-area: block-end span-inline-end;
		position-try-fallbacks: flip-block;
		margin: var(--s-1) 0;
		padding: 0;
		border: none;
		background: transparent;
		overflow: visible;
	}

	.calendar {
		background-color: var(--color-bg);
		border-radius: var(--radius-box);
		padding: var(--s-4);
		border: var(--border-style);
		max-width: fit-content;
		color: var(--color-text);
	}

	.calendarHeader {
		display: flex;
		gap: var(--s-2);
		justify-content: space-between;
		align-items: center;
		margin-block-end: var(--s-1);
		min-width: 250px;
	}

	.calendarHeading {
		font-size: var(--font-lg);
		margin: 0;
	}

	.navButton {
		background-color: transparent;
		color: var(--color-text-accent);
		border: none;
		padding: 0;
		border-radius: 100%;
		cursor: pointer;

		&:focus-visible {
			outline: var(--focus-ring);
			outline-offset: 1px;
		}
	}

	.navIcon {
		width: 27.5px;
	}

	.grid {
		width: 100%;
		border-collapse: separate;
	}

	.headerCell {
		color: var(--color-text-high);
		font-weight: var(--weight-semi);
	}

	.cell {
		display: grid;
		place-items: center;
		font-size: var(--font-sm);
		padding: var(--s-1-5);
		width: 35px;
		height: 35px;
		border-radius: var(--radius-field);
		outline-color: var(--color-accent);
		border: none;
		background: transparent;
		color: var(--color-text);
		cursor: pointer;
		margin: 0 auto;

		&:focus-visible {
			outline: var(--focus-ring);
			outline-offset: 1px;
		}

		&[data-selected] {
			background-color: var(--color-bg-high);
			color: var(--color-text-accent);
		}

		&:hover {
			background-color: var(--color-bg-high);
			outline: initial;
		}
	}
</style>
