import { describe, expect, test } from "vitest";
import { userPageRedirectPath } from "./user-page-urls";

const WITH_CUSTOM_URL = { id: 274, customUrl: "sendou" };
const WITHOUT_CUSTOM_URL = { id: 274, customUrl: null };

describe("userPageRedirectPath", () => {
	test.each([
		{
			why: "id -> custom url",
			url: "/u/274",
			user: WITH_CUSTOM_URL,
			expected: "/u/sendou",
		},
		{
			why: "discord id -> id when no custom url",
			url: "/u/79237403620945920",
			user: WITHOUT_CUSTOM_URL,
			expected: "/u/274",
		},
		{
			why: "discord id -> custom url",
			url: "/u/79237403620945920",
			user: WITH_CUSTOM_URL,
			expected: "/u/sendou",
		},
		{
			why: "custom url stays",
			url: "/u/sendou",
			user: WITH_CUSTOM_URL,
			expected: null,
		},
		{
			why: "id stays when no custom url",
			url: "/u/274",
			user: WITHOUT_CUSTOM_URL,
			expected: null,
		},
		{
			why: "keeps the sub page and search params",
			url: "/u/274/seasons/stats?season=1",
			user: WITH_CUSTOM_URL,
			expected: "/u/sendou/seasons/stats?season=1",
		},
	])("$why", ({ url, user, expected }) => {
		expect(userPageRedirectPath(new URL(url, "https://sendou.ink"), user)).toBe(
			expected,
		);
	});
});
