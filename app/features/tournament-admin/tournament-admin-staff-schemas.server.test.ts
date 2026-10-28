import { beforeEach, describe, expect, test, vi } from "bun:test";
import * as v from "valibot";
import type { CastAccount } from "~/db/tables-json";
import { adminStreamFormSchemaServer } from "./tournament-admin-staff-schemas.server";

const mockFindChannel = vi.fn();

vi.mock("~/modules/youtube/channels", () => ({
	findChannel: mockFindChannel,
}));

vi.mock("~/modules/youtube/utils.server", () => ({
	hasYoutubeEnvVars: () => true,
}));

const CHANNEL_ID = "UCabcdefghijklmnopqrstuv";
const CHANNEL = { id: CHANNEL_ID, title: "Sendou Casts" };

function parse(
	castAccounts: string[],
	currentCastAccounts: CastAccount[] = [],
) {
	return v.safeParseAsync(
		adminStreamFormSchemaServer({ currentCastAccounts }),
		{ castAccounts },
	);
}

describe("adminStreamFormSchemaServer", () => {
	beforeEach(() => {
		mockFindChannel.mockReset();
		mockFindChannel.mockResolvedValue(CHANNEL);
	});

	test("resolves twitch logins without the youtube api", async () => {
		const result = await parse(["https://twitch.tv/Sendou"]);

		expect(result.output).toEqual({
			castAccounts: [{ platform: "TWITCH", account: "sendou", name: "sendou" }],
		});
		expect(mockFindChannel).not.toHaveBeenCalled();
	});

	test("resolves a youtube handle to its channel id and title", async () => {
		const result = await parse(["@sendou"]);

		expect(result.output).toEqual({
			castAccounts: [
				{ platform: "YOUTUBE", account: CHANNEL_ID, name: CHANNEL.title },
			],
		});
		expect(mockFindChannel).toHaveBeenCalledWith({ handle: "sendou" });
	});

	test("reuses an already saved youtube channel without the youtube api", async () => {
		const saved: CastAccount = {
			platform: "YOUTUBE",
			account: CHANNEL_ID,
			name: "Saved name",
		};

		const result = await parse(
			[`https://youtube.com/channel/${CHANNEL_ID}`],
			[saved],
		);

		expect(result.output).toEqual({ castAccounts: [saved] });
		expect(mockFindChannel).not.toHaveBeenCalled();
	});

	test("dedupes inputs pointing to the same channel", async () => {
		const result = await parse([
			"@sendou",
			`youtube.com/channel/${CHANNEL_ID}`,
			"sendou",
			"SENDOU",
		]);

		expect(result.output).toEqual({
			castAccounts: [
				{ platform: "YOUTUBE", account: CHANNEL_ID, name: CHANNEL.title },
				{ platform: "TWITCH", account: "sendou", name: "sendou" },
			],
		});
	});

	test("unknown youtube channel is an issue on its input", async () => {
		mockFindChannel.mockResolvedValue(null);

		const result = await parse(["sendou", "@doesnotexist"]);

		expect(result.success).toBe(false);
		expect(result.issues?.map((issue) => issue.message)).toEqual([
			"forms:errors.youtubeChannelNotFound",
		]);
		expect(result.issues?.[0].path?.map((item) => item.key)).toEqual([
			"castAccounts",
			1,
		]);
	});

	test("invalid input fails before resolving", async () => {
		const result = await parse(["https://kick.com/sendou"]);

		expect(result.issues?.map((issue) => issue.message)).toEqual([
			"forms:errors.invalidStreamAccount",
		]);
		expect(mockFindChannel).not.toHaveBeenCalled();
	});
});
