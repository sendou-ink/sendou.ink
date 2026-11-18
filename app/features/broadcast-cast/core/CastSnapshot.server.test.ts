import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentBroadcastFactory from "~/db/seed/factories/TournamentBroadcastFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as DiscordAvatar from "~/features/auth/core/DiscordAvatar.server";
import { avatarUrl } from "~/utils/urls";
import * as CastChannel from "./CastChannel";
import * as CastSnapshot from "./CastSnapshot.server";

const CAST_ACCOUNT = {
	platform: "TWITCH" as const,
	account: "sendouink",
	name: "sendouink",
};

const AVATAR_HASH = "a1b2c3d4";

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const casterId = () => users.id(2);

beforeEach(async () => {
	await users.create(2);
});

describe("CastSnapshot.build", () => {
	test("gives the casters in their saved order with their settings and avatars, leaving out users no longer there", async () => {
		const { id: tournamentId } = await TournamentFactory.create(
			{ authorId: organizerId() },
			{ castAccounts: [CAST_ACCOUNT] },
		);
		const casterWithAvatar = await UserFactory.create({
			discordAvatar: AVATAR_HASH,
		});
		await TournamentBroadcastFactory.setCasters({
			tournamentId,
			channel: CAST_ACCOUNT,
			casters: [
				{
					userId: casterWithAvatar.id,
					vdoNinjaUrl: "https://vdo.ninja/?view=abc123",
					isAudioOnly: true,
					volume: 40,
				},
				{ userId: 999_999, vdoNinjaUrl: null, isAudioOnly: false, volume: 100 },
				{
					userId: casterId(),
					vdoNinjaUrl: null,
					isAudioOnly: false,
					volume: 100,
				},
			],
		});

		const built = await CastSnapshot.build({
			tournamentId,
			slug: CastChannel.list([CAST_ACCOUNT])[0].slug,
		});

		expect(
			built?.snapshot.casters.map((caster) => ({
				userId: caster.userId,
				vdoNinjaUrl: caster.vdoNinjaUrl,
				isAudioOnly: caster.isAudioOnly,
				volume: caster.volume,
				avatarUrl: caster.avatarUrl,
			})),
		).toEqual([
			{
				userId: casterWithAvatar.id,
				vdoNinjaUrl: "https://vdo.ninja/?view=abc123",
				isAudioOnly: true,
				volume: 40,
				avatarUrl: avatarUrl(
					DiscordAvatar.fileNameOf({
						userId: casterWithAvatar.id,
						hash: AVATAR_HASH,
					}),
					"lg",
				),
			},
			{
				userId: casterId(),
				vdoNinjaUrl: null,
				isAudioOnly: false,
				volume: 100,
				avatarUrl: null,
			},
		]);
	});
});
