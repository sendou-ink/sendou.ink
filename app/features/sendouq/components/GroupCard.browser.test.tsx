import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { GroupCard } from "./GroupCard";

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => null,
}));

const mockGroup = {
	id: 1,
	tier: null,
	tierRange: null,
	skillDifference: undefined,
	isReplay: false,
	usersRole: null,
	noScreen: false,
	modePreferences: [],
	chatCode: null,
	team: null,
	members: [
		{
			id: 1,
			discordId: "123456789",
			username: "TestUser",
			discordAvatar: null,
			customUrl: null,
			role: "OWNER",
			vc: "NO",
			languages: [],
			skill: "CALCULATING",
			weapons: [],
			plusTier: null,
			friendCode: null,
			inGameName: null,
			note: null,
			privateNote: null,
			pronouns: null,
			skillDifference: undefined,
			noScreen: undefined,
			chatNameColor: null,
			mapModePreferences: null,
		},
	],
} as unknown as ComponentProps<typeof GroupCard>["group"];

test("GroupCard renders with member", async () => {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <GroupCard group={mockGroup} displayOnly />,
			},
		],
		{ initialEntries: ["/"] },
	);

	const screen = await render(<RouterProvider router={router} />);

	await expect.element(screen.getByTestId("sendouq-group-card")).toBeVisible();
	await expect
		.element(screen.getByTestId("sendouq-group-card-member"))
		.toBeVisible();
});
