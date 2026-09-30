import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { BadgeDisplay } from "./BadgeDisplay";

const badge = (id: number, displayName: string) => ({
	id,
	code: `badge-${id}`,
	displayName,
	hue: null,
});

describe("BadgeDisplay", () => {
	test("shows the badges of the props it is given after they change", async () => {
		// e.g. navigating between organization pages: only the badges prop changes
		const screen = await render(
			<BadgeDisplay badges={[badge(1, "Alpha Invitational")]} />,
		);

		await expect
			.element(screen.getByRole("img", { name: "Alpha Invitational" }))
			.toBeInTheDocument();

		screen.rerender(<BadgeDisplay badges={[badge(2, "Beta Open")]} />);

		await expect
			.element(screen.getByRole("img", { name: "Beta Open" }), {
				timeout: 1500,
			})
			.toBeInTheDocument();
	});
});
