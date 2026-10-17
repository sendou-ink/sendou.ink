import { describe, expect, test, vi } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SendouCalendar } from "./Calendar";

// February 2024: 29 days, starting on a Thursday
const FEBRUARY_15 = new Date(2024, 1, 15);

function renderCalendar(element: React.ReactElement) {
	const router = createMemoryRouter([{ path: "*", element }], {
		initialEntries: ["/"],
	});
	return render(<RouterProvider router={router} />);
}

function focusDay(name: RegExp) {
	screen.getByRole("button", { name }).focus();
}

describe("SendouCalendar", () => {
	test.each([
		{ firstDayOfWeek: "sun", leadingBlanks: 4, weeks: 5 },
		{ firstDayOfWeek: "mon", leadingBlanks: 3, weeks: 5 },
	] as const)(
		"lays out February 2024 with the week starting on $firstDayOfWeek",
		async ({ firstDayOfWeek, leadingBlanks, weeks }) => {
			const { container } = renderCalendar(
				<SendouCalendar
					value={FEBRUARY_15}
					onChange={() => {}}
					firstDayOfWeek={firstDayOfWeek}
				/>,
			);

			const rows = container.querySelectorAll("tbody tr");
			expect(rows.length).toBe(weeks);
			const firstRowCells = [...rows[0].querySelectorAll("td")];
			expect(
				firstRowCells.filter((cell) => !cell.querySelector("button")).length,
			).toBe(leadingBlanks);
			expect(container.querySelectorAll("[role=gridcell] button").length).toBe(
				29,
			);
		},
	);

	test("only the selected day is in the tab order and marked selected", async () => {
		const { container } = renderCalendar(
			<SendouCalendar value={FEBRUARY_15} onChange={() => {}} />,
		);

		const tabbable = container.querySelectorAll('button[tabindex="0"]');
		expect(tabbable.length).toBe(1);
		expect(tabbable[0].textContent).toBe("15");
		expect(
			tabbable[0].closest("[role=gridcell]")?.getAttribute("aria-selected"),
		).toBe("true");
	});

	test("arrow keys move focus by a day and a week", async () => {
		renderCalendar(<SendouCalendar value={FEBRUARY_15} onChange={() => {}} />);

		focusDay(/February 15/);
		await userEvent.keyboard("{ArrowRight}");
		expect(screen.getByRole("button", { name: /February 16/ })).toHaveFocus();

		await userEvent.keyboard("{ArrowDown}");
		expect(screen.getByRole("button", { name: /February 23/ })).toHaveFocus();

		await userEvent.keyboard("{ArrowLeft}");
		await userEvent.keyboard("{ArrowUp}");
		expect(screen.getByRole("button", { name: /February 15/ })).toHaveFocus();
	});

	test("Home and End move to the ends of the week", async () => {
		renderCalendar(
			<SendouCalendar
				value={FEBRUARY_15}
				onChange={() => {}}
				firstDayOfWeek="mon"
			/>,
		);

		focusDay(/February 15/);
		await userEvent.keyboard("{Home}");
		expect(screen.getByRole("button", { name: /February 12/ })).toHaveFocus();

		await userEvent.keyboard("{End}");
		expect(screen.getByRole("button", { name: /February 18/ })).toHaveFocus();
	});

	test("moving past the month's edge flips the view and keeps focus", async () => {
		renderCalendar(<SendouCalendar value={FEBRUARY_15} onChange={() => {}} />);

		focusDay(/February 1,/);
		await userEvent.keyboard("{ArrowLeft}");
		await waitForFocus(/January 31/);
		expect(screen.getByRole("heading")).toHaveTextContent("January 2024");

		await userEvent.keyboard("{PageDown}");
		await waitForFocus(/February 29/);

		await userEvent.keyboard("{Shift>}{PageUp}{/Shift}");
		await waitForFocus(/February 28, 2023/);
	});

	test("clicking a day reports it at local midnight", async () => {
		const onChange = vi.fn();
		renderCalendar(<SendouCalendar value={FEBRUARY_15} onChange={onChange} />);

		await userEvent.click(screen.getByRole("button", { name: /February 20/ }));

		expect(onChange).toHaveBeenCalledWith(new Date(2024, 1, 20));
	});
});

async function waitForFocus(name: RegExp) {
	await waitFor(() =>
		expect(screen.getByRole("button", { name })).toHaveFocus(),
	);
}
