import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import {
	createTeams,
	DE_GROUPS_TO_REDEMPTION_AND_TOP_CUT,
	SE_WITHOUT_FINALS,
	startedTournamentTimes,
	teamSeeds,
} from "./helpers/tournament";
import { CalendarNewEventPage } from "./pages/calendar/calendar-new-event-page";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";

test.describe("Tournament bracket grouped elimination", () => {
	test("plays double elimination groups into a redemption and a top cut", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: DE_GROUPS_TO_REDEMPTION_AND_TOP_CUT,
		});
		await createTeams(factories, tournament.id, teamSeeds(16));
		// the higher seed wins every match: Team 1 and Team 2 win their pools unbeaten
		await factories.TournamentFactory.playOut(tournament.id, 0);

		await impersonate(page);
		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id, 0);

		await expect(brackets.groupButton("A")).toBeVisible();
		await expect(brackets.groupButton("B")).toBeVisible();
		await expect(brackets.roundHeader("WB Finals")).toBeVisible();
		await isNotVisible(brackets.roundHeader("LB Finals"));
		await isNotVisible(brackets.roundHeader("Grand Finals"));
		await expect(brackets.exitLabel("Top Cut [W]")).toBeVisible();
		await expect(brackets.exitLabel("Redemption [L]")).toBeVisible();

		await brackets.openGroup("B");
		await expect(brackets.bracketTeamName("Team 2").first()).toBeVisible();
		await isNotVisible(brackets.bracketTeamName("Team 1"));

		// Team 3 (pool B) and Team 4 (pool A) win their redemption groups, having lost their pool's winners final
		await factories.TournamentFactory.playOut(tournament.id, 1);

		await brackets.goto(tournament.id, 2);
		// pool winners take the top seeds and play a redemption winner from the other pool, not a rematch
		expect(await brackets.firstRoundTeamNames(4)).toEqual([
			"Team 1",
			"Team 3",
			"Team 2",
			"Team 4",
		]);

		await factories.TournamentFactory.playOut(tournament.id, 2);

		await brackets.goto(tournament.id);
		const finalizeDialog = await brackets.openFinalizeTournamentDialog();
		await finalizeDialog.confirm();
		await isNotVisible(brackets.locators.finalizeTournamentButton);
	});

	test("finalizes a tournament with co-winners, each of them getting the trophy", async ({
		page,
		factories,
	}) => {
		const trophy = await factories.TrophyFactory.create({
			name: "Co-winner Trophy",
		});
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			startTimes: startedTournamentTimes(),
			bracketProgression: SE_WITHOUT_FINALS,
			trophyId: trophy.id,
		});
		await createTeams(factories, tournament.id, teamSeeds(4));
		await factories.TournamentFactory.playOut(tournament.id, 0);

		await impersonate(page);
		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		await isNotVisible(brackets.roundHeader("Finals"));

		const finalizeDialog = await brackets.openFinalizeTournamentDialog();
		// one trophy receiver picker per 1st place team, full rosters picked by default
		await expect(finalizeDialog.trophyTeamHeading("Team 1")).toBeVisible();
		await expect(finalizeDialog.trophyTeamHeading("Team 2")).toBeVisible();
		await finalizeDialog.confirm();
		await isNotVisible(brackets.locators.finalizeTournamentButton);
	});

	test("builds a grouped double elimination with rounds left unplayed", async ({
		page,
		factories,
	}) => {
		const organizer = await factories.UserFactory.create(null, {
			roles: ["TOURNAMENT_ORGANIZER"],
		});
		await impersonate(page, organizer.id);

		const newTournament = new CalendarNewEventPage(page);
		await newTournament.gotoNewTournament();

		await newTournament.form.fill("name", "Grouped Tournament");
		await newTournament.setFirstDate(new Date(2027, 0, 15, 17, 0));

		await newTournament.goToStep("maps");
		await newTournament.form.checkItems("mapPickingStyle", ["TO"]);
		await newTournament.pickMapPool([
			{ stage: "Scorch Gorge", mode: "Splat Zones" },
			{ stage: "Eeltail Alley", mode: "Tower Control" },
		]);

		await newTournament.selectBracket(0);
		await newTournament.locators.groupCountSelect.selectOption("4");

		const roundPlayed = (round: string) =>
			newTournament.roundPlayedCheckbox(round);

		// a round can't be played without the rounds feeding teams to it
		await roundPlayed("LB_SEMIS").uncheck();
		for (const round of ["LB_FINALS", "GRAND_FINALS", "BRACKET_RESET"]) {
			await expect(roundPlayed(round)).not.toBeChecked();
		}
		await expect(roundPlayed("WB_FINALS")).toBeChecked();
		await expect(
			newTournament.roundNotPlayedHint("Losers bracket semifinals"),
		).toBeVisible();

		// playing a round again plays what it depends on too
		await roundPlayed("GRAND_FINALS").check();
		for (const round of ["LB_SEMIS", "LB_FINALS", "GRAND_FINALS"]) {
			await expect(roundPlayed(round)).toBeChecked();
		}
		await expect(roundPlayed("BRACKET_RESET")).not.toBeChecked();

		await newTournament.save();
		await expect(page).toHaveURL(/\/to\/\d+/);
	});
});
