import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import {
	createTeams,
	DOUBLE_ELIMINATION,
	ROUND_ROBIN,
	SWISS_TO_TOP_CUT,
	startedTournamentTimes,
	TO_MAP_POOL,
	teamSeeds,
} from "./helpers/tournament";
import { ChatSidebar } from "./pages/layout/chat-sidebar";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";

const BRACKET_TYPES = [
	{ name: "double elimination", bracketProgression: DOUBLE_ELIMINATION },
	{ name: "round robin", bracketProgression: ROUND_ROBIN },
	{
		name: "swiss",
		bracketProgression: SWISS_TO_TOP_CUT,
		// a group other than the default one, so the group is part of what is remembered
		selectGroup: "B",
	},
];

test.describe("Tournament bracket scroll position", () => {
	for (const { name, bracketProgression, selectGroup } of BRACKET_TYPES) {
		test(`returns to the spot a ${name} bracket was left at`, async ({
			page,
			factories,
		}) => {
			const tournament = await factories.TournamentFactory.create({
				authorId: ADMIN_ID,
				startTimes: startedTournamentTimes(),
				bracketProgression,
				mapPoolMaps: TO_MAP_POOL,
			});
			// enough teams for the bracket to be scrolled past the first screen
			await createTeams(factories, tournament.id, teamSeeds(32));

			await impersonate(page);

			const brackets = new TournamentBracketsPage(page);
			await brackets.goto(tournament.id);
			await brackets.finalize();
			// the elimination bracket's height does not follow the finalize controls above it going away
			await brackets.reload();
			// match pages open the chat, which narrows the bracket: open it from the start for one layout throughout
			await new ChatSidebar(page).open();

			if (selectGroup) {
				const otherGroupMatchId = await brackets.lastMatchId();
				await brackets.openGroup(selectGroup);
				await isNotVisible(brackets.match(otherGroupMatchId));
			}

			const matchId = await brackets.lastMatchId();
			await brackets.scrollMatchNearTopLeft(matchId);
			const leftAt = await brackets.matchViewportPosition(matchId);
			const expectAtLeftSpot = () =>
				expect
					.poll(() => brackets.matchViewportPosition(matchId))
					.toEqual(leftAt);

			const match = await brackets.openMatch(matchId);
			await match.backToBracket();
			await expectAtLeftSpot();

			await brackets.openMatch(matchId);
			await match.browserBack();
			await expectAtLeftSpot();

			// opened from elsewhere, the spot the bracket was left at does not show the match
			await brackets.scrollToStart();
			await match.goto({ tournamentId: tournament.id, matchId });
			await match.backToBracket();
			await expect(brackets.match(matchId)).toBeInViewport();
		});
	}
});
