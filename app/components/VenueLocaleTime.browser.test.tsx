import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { VenueLocaleTime } from "./VenueLocaleTime";

const OPTIONS: Intl.DateTimeFormatOptions = {
	hour: "numeric",
	minute: "numeric",
};
const DATE = new Date("2026-11-21T16:00:00.000Z");

const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const otherTimeZone =
	browserTimeZone === "Asia/Tokyo" ? "America/Chicago" : "Asia/Tokyo";

function renderTime(
	venueTimezone: string | null,
	{ to, inline }: { to?: Date; inline?: boolean } = {},
) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<VenueLocaleTime
						date={DATE}
						to={to}
						options={OPTIONS}
						venueTimezone={venueTimezone}
						inline={inline}
					/>
				),
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

const DATE_TO = new Date("2026-11-21T17:00:00.000Z");

function formatter(timeZone?: string) {
	const language =
		navigator.languages.find(
			(lang) => lang.split("-")[0].toLowerCase() === "en",
		) ?? "en";

	return new Intl.DateTimeFormat(language, { ...OPTIONS, timeZone });
}

function formatted(timeZone?: string) {
	return formatter(timeZone).format(DATE);
}

describe("VenueLocaleTime", () => {
	test("shows venue time first and the viewer's underneath when they differ", async () => {
		const screen = await renderTime(otherTimeZone);

		await expect
			.element(screen.getByText(`${formatted(otherTimeZone)} local`))
			.toBeVisible();
		await expect
			.element(screen.getByText(`${formatted()} your time`))
			.toBeVisible();
	});

	test("leaves the viewer's time out when it reads the same", async () => {
		const screen = await renderTime(browserTimeZone);

		await expect
			.element(screen.getByText(`${formatted()} local`))
			.toBeVisible();
		expect(screen.container.textContent).not.toContain("your time");
	});

	test("shows a plain time for an online event", async () => {
		const screen = await renderTime(null);

		await expect.element(screen.getByText(formatted())).toBeVisible();
		expect(screen.container.textContent).not.toContain("local");
	});

	test("shows the viewer's time in brackets when inline", async () => {
		const screen = await renderTime(otherTimeZone, { inline: true });

		await expect
			.element(
				screen.getByText(
					`${formatted(otherTimeZone)} local (${formatted()} your time)`,
				),
			)
			.toBeVisible();
	});

	test("shows a range in venue time", async () => {
		const screen = await renderTime(otherTimeZone, { to: DATE_TO });

		await expect
			.element(
				screen.getByText(
					`${formatter(otherTimeZone).formatRange(DATE, DATE_TO)} local`,
				),
			)
			.toBeVisible();
	});
});
