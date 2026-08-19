type RedirectRule = {
	/** Path to redirect from. A trailing `/*` matches the path and anything below it. */
	from: string;
	/**
	 * Path to redirect to. Ends with `/*` if `from` does, the matched suffix being appended to it.
	 * May contain a query string, in which case the original one is merged into it.
	 */
	to: string;
};

const WILDCARD_SUFFIX = "/*";

const leagueDivisionRedirects = (args: {
	firstDivisionTournamentId: number;
	divisionsCount: number;
	seasonTournamentId: number;
}): RedirectRule[] =>
	Array.from({ length: args.divisionsCount }, (_, idx) => ({
		from: `/to/${args.firstDivisionTournamentId + idx}/*`,
		to: `/to/${args.seasonTournamentId}/*`,
	}));

const REDIRECTS: RedirectRule[] = [
	// LUTI seasons used to be one tournament per division, now they are one tournament per season
	...leagueDivisionRedirects({
		firstDivisionTournamentId: 1241,
		divisionsCount: 13,
		seasonTournamentId: 1066,
	}),
	...leagueDivisionRedirects({
		firstDivisionTournamentId: 3325,
		divisionsCount: 13,
		seasonTournamentId: 3192,
	}),
	// update once per season
	{ from: "/luti", to: "/to/3192" },
	// pages that used to have a route of their own
	{ from: "/play", to: "/q" },
	{ from: "/q/settings", to: "/settings?tab=match-profile" },
	{ from: "/plus", to: "/plus/suggestions" },
	{ from: "/u", to: "/?search=open&type=users" },
	{ from: "/t", to: "/?search=open&type=teams" },
];

/**
 * Resolves where a location should redirect to, or null if it should be served as is.
 * The query string and the part of the path matched by a wildcard are preserved.
 *
 * @example
 * Redirect.resolve({ pathname: "/to/3325/teams/58397", search: "" }) // "/to/3192/teams/58397"
 */
export function resolve(location: {
	pathname: string;
	search?: string;
}): string | null {
	const pathname = normalizedPathname(location.pathname);

	for (const redirect of REDIRECTS) {
		const target = resolvedTarget(redirect, pathname);
		if (target) return withSearch(target, location.search);
	}

	return null;
}

function withSearch(target: string, search?: string) {
	if (!search || search === "?") return target;

	return target.includes("?")
		? `${target}&${search.slice(1)}`
		: `${target}${search}`;
}

function resolvedTarget(redirect: RedirectRule, pathname: string) {
	if (!redirect.from.endsWith(WILDCARD_SUFFIX)) {
		return redirect.from === pathname ? redirect.to : null;
	}

	const prefix = redirect.from.slice(0, -WILDCARD_SUFFIX.length);
	if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;

	if (!redirect.to.endsWith(WILDCARD_SUFFIX)) return redirect.to;

	return (
		redirect.to.slice(0, -WILDCARD_SUFFIX.length) +
		pathname.slice(prefix.length)
	);
}

function normalizedPathname(pathname: string) {
	return pathname.length > 1 && pathname.endsWith("/")
		? pathname.slice(0, -1)
		: pathname;
}
