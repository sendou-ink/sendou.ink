import type * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SendouCalendar } from "./Calendar";

// February 2024: 29 days, starting on a Thursday
const FEBRUARY_15 = new Date(2024, 1, 15);

function renderCalendar(element: React.ReactElement) {
	const router = createMemoryRouter([{ path: "*", element }], {
		initialEntries: ["/"],
	});
	return render(<RouterProvider router={router} />);
}

async function focusDay(
	screen: Awaited<ReturnType<typeof render>>,
	name: RegExp,
) {
	(await screen.getByRole("button", { name }).element()).focus();
}

describe("SendouCalendar", () => {
	test.each([
		{ firstDayOfWeek: "sun", leadingBlanks: 4, weeks: 5 },
		{ firstDayOfWeek: "mon", leadingBlanks: 3, weeks: 5 },
	] as const)(
		"lays out February 2024 with the week starting on $firstDayOfWeek",
		async ({ firstDayOfWeek, leadingBlanks, weeks }) => {
			const screen = await renderCalendar(
				<SendouCalendar
					value={FEBRUARY_15}
					onChange={() => {}}
					firstDayOfWeek={firstDayOfWeek}
				/>,
			);

			const rows = screen.container.querySelectorAll("tbody tr");
			expect(rows.length).toBe(weeks);
			const firstRowCells = [...rows[0].querySelectorAll("td")];
			expect(
				firstRowCells.filter((cell) => !cell.querySelector("button")).length,
			).toBe(leadingBlanks);
			expect(
				screen.container.querySelectorAll("[role=gridcell] button").length,
			).toBe(29);
		},
	);

	test("only the selected day is in the tab order and marked selected", async () => {
		const screen = await renderCalendar(
			<SendouCalendar value={FEBRUARY_15} onChange={() => {}} />,
		);

		const tabbable = screen.container.querySelectorAll('button[tabindex="0"]');
		expect(tabbable.length).toBe(1);
		expect(tabbable[0].textContent).toBe("15");
		expect(
			tabbable[0].closest("[role=gridcell]")?.getAttribute("aria-selected"),
		).toBe("true");
	});

	test("arrow keys move focus by a day and a week", async () => {
		const screen = await renderCalendar(
			<SendouCalendar value={FEBRUARY_15} onChange={() => {}} />,
		);

		await focusDay(screen, /February 15/);
		await userEvent.keyboard("{ArrowRight}");
		await expect
			.element(screen.getByRole("button", { name: /February 16/ }))
			.toHaveFocus();

		await userEvent.keyboard("{ArrowDown}");
		await expect
			.element(screen.getByRole("button", { name: /February 23/ }))
			.toHaveFocus();

		await userEvent.keyboard("{ArrowLeft}");
		await userEvent.keyboard("{ArrowUp}");
		await expect
			.element(screen.getByRole("button", { name: /February 15/ }))
			.toHaveFocus();
	});

	test("Home and End move to the ends of the week", async () => {
		const screen = await renderCalendar(
			<SendouCalendar
				value={FEBRUARY_15}
				onChange={() => {}}
				firstDayOfWeek="mon"
			/>,
		);

		await focusDay(screen, /February 15/);
		await userEvent.keyboard("{Home}");
		await expect
			.element(screen.getByRole("button", { name: /February 12/ }))
			.toHaveFocus();

		await userEvent.keyboard("{End}");
		await expect
			.element(screen.getByRole("button", { name: /February 18/ }))
			.toHaveFocus();
	});

	test("moving past the month's edge flips the view and keeps focus", async () => {
		const screen = await renderCalendar(
			<SendouCalendar value={FEBRUARY_15} onChange={() => {}} />,
		);

		await focusDay(screen, /February 1,/);
		await userEvent.keyboard("{ArrowLeft}");
		await expect
			.element(screen.getByRole("button", { name: /January 31/ }))
			.toHaveFocus();
		await expect
			.element(screen.getByRole("heading"))
			.toHaveTextContent("January 2024");

		await userEvent.keyboard("{PageDown}");
		await expect
			.element(screen.getByRole("button", { name: /February 29/ }))
			.toHaveFocus();

		await userEvent.keyboard("{Shift>}{PageUp}{/Shift}");
		await expect
			.element(screen.getByRole("button", { name: /February 28, 2023/ }))
			.toHaveFocus();
	});

	test("clicking a day reports it at local midnight", async () => {
		const onChange = vi.fn();
		const screen = await renderCalendar(
			<SendouCalendar value={FEBRUARY_15} onChange={onChange} />,
		);

		await screen.getByRole("button", { name: /February 20/ }).click();

		expect(onChange).toHaveBeenCalledWith(new Date(2024, 1, 20));
	});
});
