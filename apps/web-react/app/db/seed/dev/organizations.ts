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

	return [{ id: created.id, name: "sendou.ink", seriesNames: ["PICNIC"] }];
}
