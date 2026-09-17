import type { LoaderFunctionArgs } from "react-router";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TournamentProvider } from "~/features/tournament/tournament-context";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import TournamentAdminRegistrationPage from "./to.$id.admin.registration.$tid";

// stubbed so importing the route in a browser test doesn't pull in the database-backed action
vi.mock(
	"~/features/tournament-admin/actions/to.$id.admin.registration.server",
	() => ({ action: vi.fn() }),
);

vi.mock(
	"~/features/tournament-admin/loaders/to.$id.admin.registration.$tid.server",
	() => ({ loader: vi.fn() }),
);

const ROUTE_ID = "registration";

const tournament = {
	ctx: { id: 1, settings: { requireInGameNames: false } },
	canEditTournamentNames: (): boolean => false,
} as unknown as Tournament;

// no team -> "add new team" flow, where the roster is built via user search
const LOADER_DATA = { team: null };

const GREY = {
	type: "user" as const,
	id: 5,
	name: "Grey",
	inGameName: null,
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
				id: ROUTE_ID,
				path: "/",
				element: (
					<TournamentProvider tournament={tournament}>
						<TournamentAdminRegistrationPage />
					</TournamentProvider>
				),
				loader: () => LOADER_DATA,
				action: () => null,
			},
			{
				path: "/search",
				loader: ({ request }: LoaderFunctionArgs) => {
					// biome-ignore lint/plugin: stub loader standing in for the real search route, reading the request the component built
					const query = new URL(request.url).searchParams.get("q") ?? "";
					return {
						query,
						type: "users",
						results: query === GREY.name ? [GREY] : [],
					};
				},
			},
		],
		{
			initialEntries: ["/"],
			hydrationData: { loaderData: { [ROUTE_ID]: LOADER_DATA } },
		},
	);

	return render(<RouterProvider router={router} />);
}

describe("tournament admin registration - captain label", () => {
	test("captain dropdown shows the searched player's name, not a generic placeholder", async () => {
		const screen = await renderPage();

		await userEvent.click(screen.getByRole("button", { name: "Player" }));
		await userEvent.type(
			screen.getByTestId("user-search-input").element(),
			GREY.name,
		);
		// auto-retries until the debounced search resolves
		await screen.getByTestId("user-search-item").click();

		// labelled by name, not "Player 1"
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
