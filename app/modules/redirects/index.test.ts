import { describe, expect, test } from "vitest";
import { resolveRedirect } from "./index";

describe("resolveRedirect", () => {
	test.each([
		{
			why: "exact match",
			pathname: "/luti",
			expected: "/to/3192",
		},
		{
			why: "trailing slash",
			pathname: "/luti/",
			expected: "/to/3192",
		},
		{
			why: "wildcard root",
			pathname: "/to/3325",
			expected: "/to/3192",
		},
		{
			why: "wildcard suffix preserved",
			pathname: "/to/3325/teams/58397",
			expected: "/to/3192/teams/58397",
		},
		{
			why: "last division of a season",
			pathname: "/to/1253/brackets",
			expected: "/to/1066/brackets",
		},
		{
			why: "page that lost its route",
			pathname: "/play",
			expected: "/q",
		},
		{
			why: "target with a query string of its own",
			pathname: "/t",
			expected: "/?search=open&type=teams",
		},
		{
			why: "no matching redirect",
			pathname: "/to/3192/teams/58397",
			expected: null,
		},
		{
			why: "id only a prefix of a redirected id",
			pathname: "/to/33250",
			expected: null,
		},
	])("$why", ({ pathname, expected }) => {
		expect(resolveRedirect({ pathname })).toBe(expected);
	});

	test("keeps the query string", () => {
		expect(
			resolveRedirect({ pathname: "/to/3325/brackets", search: "?idx=1" }),
		).toBe("/to/3192/brackets?idx=1");
	});

	test("merges the query string into a target that has one", () => {
		expect(resolveRedirect({ pathname: "/u", search: "?foo=bar" })).toBe(
			"/?search=open&type=users&foo=bar",
		);
	});

	test("resolved target is not itself redirected", () => {
		const target = resolveRedirect({ pathname: "/to/3325/teams/58397" });

		expect(resolveRedirect({ pathname: target! })).toBeNull();
	});
});
