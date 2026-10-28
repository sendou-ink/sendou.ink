import type * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import * as Availability from "../core/Availability";
import * as ScheduleWeek from "../core/ScheduleWeek";
import { ScheduleHeatmap } from "./ScheduleHeatmap";

type HeatmapProps = React.ComponentProps<typeof ScheduleHeatmap>;

const TIMEZONE = "Europe/Helsinki";
const PLAYER_ID = 1;

function renderHeatmap(props: HeatmapProps) {
	const router = createMemoryRouter(
		[{ path: "*", element: <ScheduleHeatmap {...props} /> }],
		{ initialEntries: ["/"] },
	);
	return render(<RouterProvider router={router} />);
}

/** A week as the team schedule loader builds it, the player free 18:00–22:00 (viewer-local) on the given days. */
function weekFreeOn(dates: Array<string>): HeatmapProps["week"] {
	const range = Availability.weekRange(
		new Date("2026-10-21T12:00:00Z"),
		TIMEZONE,
	);
	const days = ScheduleWeek.days(range, TIMEZONE).map((day) => ({
		...day,
		startsAt: Availability.localToTimestamp({
			date: day.date,
			time: "00:00",
			timezone: TIMEZONE,
		}),
		windowTier: null,
	}));
	const slots = dates.map((date) => ({
		startsAt: Availability.localToTimestamp({
			date,
			time: "18:00",
			timezone: TIMEZONE,
		}),
		endsAt: Availability.localToTimestamp({
			date,
			time: "22:00",
			timezone: TIMEZONE,
		}),
	}));

	return {
		startsAt: range.startsAt,
		weekNumber: ScheduleWeek.weekNumber(range, TIMEZONE),
		timezone: TIMEZONE,
		days,
		members: [
			ScheduleWeek.memberRow({
				userId: PLAYER_ID,
				days,
				timezone: TIMEZONE,
				reportedWeeks: [
					{
						userId: PLAYER_ID,
						weekStartsAt: range.startsAt,
						timezone: TIMEZONE,
						slots,
						dayNotes: [],
					},
				],
				range,
				busy: [],
			}),
		],
		windows: [],
		minPlayers: 1,
		teamEvents: [],
	} as unknown as HeatmapProps["week"];
}

const members = [
	{
		id: PLAYER_ID,
		username: "Player",
		role: null,
		roleType: "PLAYER",
		discordId: "1",
		avatar: null,
	},
] as unknown as HeatmapProps["members"];

function freeCellIndicesByDay(container: HTMLElement) {
	const rows = new Map<Element, Array<number>>();
	const cells = container.querySelectorAll<HTMLElement>(
		'[data-testid="schedule-heatmap-cell"]',
	);

	for (const cell of cells) {
		const row = cell.parentElement!;
		const indices = rows.get(row) ?? [];
		if (cell.dataset.count !== "0") {
			indices.push(Array.from(row.children).indexOf(cell));
		}
		rows.set(row, indices);
	}

	return Array.from(rows.values());
}

describe("ScheduleHeatmap", () => {
	// Sunday 2026-10-25 is the EU fall-back day (04:00 EEST -> 03:00 EET), a 25 hour day
	test("puts the same wall-clock hours in the same columns on a DST change day", async () => {
		const screen = await renderHeatmap({
			week: weekFreeOn(["2026-10-24", "2026-10-25"]),
			members,
		});

		const [, , , , , saturday, sunday] = freeCellIndicesByDay(screen.container);

		expect(saturday.length).toBeGreaterThan(0);
		expect(sunday).toEqual(saturday);
	});
});
