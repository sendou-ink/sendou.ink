import { deleteAllRows } from "~/db/wipe";
import { clearAllTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { withoutInfoLogs } from "~/utils/logger";
import { resetFactories } from "./core/defineFactory";
import { resetFaker } from "./core/faker";
import { seedBadges } from "./dev/badges";
import { seedBuilds } from "./dev/builds";
import { seedCalendarEvents } from "./dev/calendar";
import { seedResultHighlights } from "./dev/highlights";
import { seedMisc } from "./dev/misc";
import { seedOrganizations } from "./dev/organizations";
import { seedPlus } from "./dev/plus";
import { seedScrimsAndLFG } from "./dev/scrims-lfg";
import { seedSendouQ } from "./dev/sendouq";
import { seedTeams } from "./dev/teams";
import { seedTournaments } from "./dev/tournaments";
import { seedSpecialTrophies, seedTrophies } from "./dev/trophies";
import { seedUsers } from "./dev/users";
import { seedVods } from "./dev/vods";

export async function seed() {
	await deleteAllRows();
	resetFactories();

	const users = await runModule(() => seedUsers());
	const badges = await runModule(() => seedBadges(users));
	const organizations = await runModule(() => seedOrganizations(users));
	const trophies = await runModule(() =>
		seedTrophies({ users, organizations }),
	);
	const teams = await runModule(() => seedTeams(users));
	const calendarEvents = await runModule(() =>
		seedCalendarEvents(users, badges),
	);
	const tournaments = await runModule(() =>
		seedTournaments({ users, organizations, badges, teams, trophies }),
	);
	await runModule(() =>
		seedResultHighlights({ users, calendarEvents, tournaments }),
	);
	const sendouq = await runModule(() => seedSendouQ(users, teams));
	await runModule(() => seedPlus(users));
	await runModule(() => seedBuilds(users));
	await runModule(() => seedScrimsAndLFG(users, teams));
	await runModule(() => seedVods(users));
	await runModule(() => seedMisc({ users, sendouq, tournaments }));
	await runModule(() => seedSpecialTrophies());

	clearAllTournamentDataCache();
}

function runModule<T>(module: () => Promise<T>) {
	resetFaker();

	return withoutInfoLogs(module);
}
