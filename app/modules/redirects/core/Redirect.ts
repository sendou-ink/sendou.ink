type RedirectRule = {
	/** Path to redirect from. A trailing `/*` matches the path and anything below it. */
	from: string;
	/** Ends with `/*` if `from` does (matched suffix appended). A query string here is merged with the original. */
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
 * Where a location redirects to, or null to serve as is. Query string and wildcard-matched path are preserved,
 * e.g. `/to/3325/teams/58397` → `/to/3192/teams/58397`.
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
