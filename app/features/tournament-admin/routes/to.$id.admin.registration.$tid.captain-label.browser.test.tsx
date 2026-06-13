import type { LoaderFunctionArgs } from "react-router";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

const { mockTournament } = vi.hoisted(() => ({
	mockTournament: {
		ctx: { id: 1, settings: { requireInGameNames: false } },
		teamById: vi.fn(),
	},
}));

vi.mock("react-router", async () => {
	const actual = await vi.importActual("react-router");
	return {
		...actual,
		// no tid -> "add new team" flow, where the roster is built via user search
		useParams: () => ({}),
	};
});

vi.mock("~/features/tournament/routes/to.$id", () => ({
	useTournament: () => mockTournament,
}));

vi.mock(
	"~/features/tournament-admin/actions/to.$id.admin.registration.server",
	() => ({ action: vi.fn() }),
);

import TournamentAdminRegistrationPage from "./to.$id.admin.registration.$tid";

const GREY = {
	type: "user" as const,
	id: 5,
	name: "Grey",
	secondaryName: null,
	avatarUrl: null,
	discordId: "123",
	discordAvatar: null,
	customUrl: null,
	plusTier: null,
};

function renderPage() {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <TournamentAdminRegistrationPage />,
				action: () => null,
			},
			{
				path: "/search",
				loader: ({ request }: LoaderFunctionArgs) => {
					const query = new URL(request.url).searchParams.get("q") ?? "";
					return {
						query,
						type: "users",
						results: query === GREY.name ? [GREY] : [],
					};
				},
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

describe("tournament admin registration - captain label", () => {
	test("captain dropdown shows the searched player's name, not a generic placeholder", async () => {
		const screen = await renderPage();

		// Pick a player in member #1 via the user search.
		await userEvent.click(screen.getByRole("button", { name: "Player" }));
		await userEvent.type(
			screen.getByTestId("user-search-input").element(),
			GREY.name,
		);
		// Auto-retries until the debounced search resolves and the result appears.
		await screen.getByTestId("user-search-item").click();

		// The Captain <select> should label that player by name, not "Player 1".
		await expect
			.poll(
				() =>
					screen
						.getByLabelText("Captain")
						.element()
						.querySelector(`option[value="${GREY.id}"]`)?.textContent,
			)
			.toBe(GREY.name);
	});
});
