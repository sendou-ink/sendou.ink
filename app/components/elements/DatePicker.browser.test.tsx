import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SendouDatePicker } from "./DatePicker";

describe("SendouDatePicker", () => {
	test.each([
		{
			why: "date only, read as local time",
			granularity: "day",
			input: "2024-02-15",
			expected: new Date(2024, 1, 15),
		},
		{
			why: "date and time",
			granularity: "minute",
			input: "2024-02-15T10:30",
			expected: new Date(2024, 1, 15, 10, 30),
		},
		{
			why: "a year below 100 is not read as 19xx",
			granularity: "day",
			input: "0099-01-15",
			expected: new Date("0099-01-15T00:00:00"),
		},
	] as const)("parses $why", async ({ granularity, input, expected }) => {
		const onChange = vi.fn();
		const screen = await render(
			<SendouDatePicker
				aria-label="When"
				granularity={granularity}
				value={null}
				onChange={onChange}
			/>,
		);

		await screen.getByLabelText("When").fill(input);

		expect(onChange).toHaveBeenLastCalledWith(expected, { isBadInput: false });
	});

	test("clearing the input reports null", async () => {
		const onChange = vi.fn();
		const screen = await render(
			<SendouDatePicker
				aria-label="When"
				granularity="day"
				value={new Date(2024, 1, 15)}
				onChange={onChange}
			/>,
		);

		await screen.getByLabelText("When").fill("");

		expect(onChange).toHaveBeenLastCalledWith(null, { isBadInput: false });
	});

	test("reads and writes the value in the given zone", async () => {
		const onChange = vi.fn();
		const screen = await render(
			<SendouDatePicker
				aria-label="When"
				value={new Date("2026-03-29T03:30:00.000Z")}
				onChange={onChange}
				timeZone="UTC"
			/>,
		);

		await expect
			.element(screen.getByLabelText("When"))
			.toHaveValue("2026-03-29T03:30");

		await screen.getByLabelText("When").fill("2026-03-29T02:15");

		expect(onChange).toHaveBeenLastCalledWith(
			new Date("2026-03-29T02:15:00.000Z"),
			{ isBadInput: false },
		);
	});
});
