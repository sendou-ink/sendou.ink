import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
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
		const { rerender } = render(
			<BadgeDisplay badges={[badge(1, "Alpha Invitational")]} />,
		);

		expect(
			await screen.findByRole("img", { name: "Alpha Invitational" }),
		).toBeInTheDocument();

		rerender(<BadgeDisplay badges={[badge(2, "Beta Open")]} />);

		expect(
			await screen.findByRole("img", { name: "Beta Open" }, { timeout: 1500 }),
		).toBeInTheDocument();
	});
});
