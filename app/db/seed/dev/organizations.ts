import * as TournamentOrganizationFactory from "../factories/TournamentOrganizationFactory";
import type { SeededUsers } from "./users";

export type SeededOrganization = {
	id: number;
	name: string;
	seriesNames: string[];
};

export async function seedOrganizations(
	users: SeededUsers,
): Promise<SeededOrganization[]> {
	const created = await TournamentOrganizationFactory.create(
		{ name: "sendou.ink", ownerId: users.adminId },
		{
			avatarFileName: "default.png",
			description: "Sendou.ink official tournaments",
			socials: [
				"https://bsky.app/profile/sendou.ink",
				"https://twitch.tv/sendou",
			],
			series: [
				{
					name: "PICNIC",
					description: "PICNIC tournament series",
					showLeaderboard: false,
				},
			],
			members: [
				{ userId: users.orgAdminId, role: "ADMIN" },
				{ userId: users.nzapId, role: "MEMBER" },
			],
			isEstablished: true,
		},
	);

	const luti = await TournamentOrganizationFactory.create(
		{ name: "Leagues Under The Ink", ownerId: users.orgAdminId },
		{
			description: "The long-running Splatoon league, one season at a time",
			series: [
				{
					name: "LUTI",
					description: "Seasons of Leagues Under The Ink",
					showLeaderboard: false,
				},
			],
			members: [{ userId: users.adminId, role: "ADMIN" }],
			isEstablished: true,
		},
	);

	return [
		{ id: created.id, name: "sendou.ink", seriesNames: ["PICNIC"] },
		{ id: luti.id, name: "Leagues Under The Ink", seriesNames: ["LUTI"] },
	];
}
