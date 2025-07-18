import {
	index,
	prefix,
	type RouteConfig,
	route,
} from "@remix-run/route-config";

const devOnlyRoutes =
	process.env.NODE_ENV === "development"
		? ([
				route(
					"/admin/generate-images",
					"features/admin/routes/generate-images.tsx",
				),
			] satisfies RouteConfig)
		: [];

export default [
	index("features/front-page/routes/index.tsx"),
	route("/patrons-list", "features/front-page/routes/patrons-list.ts"),

	route("/notifications", "features/notifications/routes/notifications.tsx"),
	route(
		"/notifications/seen",
		"features/notifications/routes/notifications.seen.ts",
	),
	route(
		"/notifications/subscribe",
		"features/notifications/routes/notifications.subscribe.ts",
	),

	route("/settings", "features/settings/routes/settings.tsx"),

	route("/suspended", "features/ban/routes/suspended.tsx"),

	route("/u", "features/user-search/routes/u.tsx"),

	route("/u/:identifier", "features/user-page/routes/u.$identifier.tsx", [
		index("features/user-page/routes/u.$identifier.index.tsx"),
		route("art", "features/user-page/routes/u.$identifier.art.tsx"),
		route("edit", "features/user-page/routes/u.$identifier.edit.tsx"),
		route("seasons", "features/user-page/routes/u.$identifier.seasons.tsx"),
		route("vods", "features/user-page/routes/u.$identifier.vods.tsx"),
		route("builds", "features/user-page/routes/u.$identifier.builds.tsx"),
		route(
			"builds/new",
			"features/user-page/routes/u.$identifier.builds.new.tsx",
		),
		route("results", "features/user-page/routes/u.$identifier.results.tsx"),
		route(
			"results/highlights",
			"features/user-page/routes/u.$identifier.results.highlights.tsx",
		),
		route("admin", "features/user-page/routes/u.$identifier.admin.tsx"),
	]),

	route("/badges", "features/badges/routes/badges.tsx", [
		route(":id", "features/badges/routes/badges.$id.tsx", [
			route("edit", "features/badges/routes/badges.$id.edit.tsx"),
		]),
	]),

	...prefix("/calendar", [
		index("features/calendar/routes/calendar.tsx"),
		route("new", "features/calendar/routes/calendar.new.tsx"),
		route(":id", "features/calendar/routes/calendar.$id.tsx"),
		route(
			":id/report-winners",
			"features/calendar/routes/calendar.$id.report-winners.tsx",
		),
	]),
	route("/calendar.ics", "features/calendar/routes/calendar.ics.tsx"),

	route("/maps", "features/map-list-generator/routes/maps.tsx"),

	route("/upload", "features/img-upload/routes/upload.tsx"),
	route("/upload/admin", "features/img-upload/routes/upload.admin.tsx"),

	route("/plans", "features/map-planner/routes/plans.tsx"),

	route("/analyzer", "features/build-analyzer/routes/analyzer.tsx"),

	route(
		"/object-damage-calculator",
		"features/object-damage-calculator/routes/object-damage-calculator.tsx",
	),

	route("/to/:id", "features/tournament/routes/to.$id.tsx", [
		index("features/tournament/routes/to.$id.index.ts"),
		route("register", "features/tournament/routes/to.$id.register.tsx"),
		route("teams", "features/tournament/routes/to.$id.teams.tsx"),
		route("teams/:tid", "features/tournament/routes/to.$id.teams.$tid.tsx"),
		route("join", "features/tournament/routes/to.$id.join.tsx"),
		route("admin", "features/tournament/routes/to.$id.admin.tsx"),
		route("seeds", "features/tournament/routes/to.$id.seeds.tsx"),
		route("results", "features/tournament/routes/to.$id.results.tsx"),
		route("streams", "features/tournament/routes/to.$id.streams.tsx"),

		route("subs", "features/tournament-subs/routes/to.$id.subs.tsx"),
		route("subs/new", "features/tournament-subs/routes/to.$id.subs.new.tsx"),

		route(
			"divisions",
			"features/tournament-bracket/routes/to.$id.divisions.tsx",
		),
		route(
			"brackets",
			"features/tournament-bracket/routes/to.$id.brackets.tsx",
			[
				route(
					"finalize",
					"features/tournament-bracket/routes/to.$id.brackets.finalize.tsx",
				),
			],
		),
		route(
			"brackets/subscribe",
			"features/tournament-bracket/routes/to.$id.brackets.subscribe.ts",
		),
		route(
			"matches/:mid",
			"features/tournament-bracket/routes/to.$id.matches.$mid.tsx",
		),
		route(
			"matches/:mid/subscribe",
			"features/tournament-bracket/routes/to.$id.matches.$mid.subscribe.ts",
		),
	]),
	route("luti", "features/tournament/routes/luti.ts"),

	...prefix("/org/:slug", [
		index("features/tournament-organization/routes/org.$slug.tsx"),
		route("edit", "features/tournament-organization/routes/org.$slug.edit.tsx"),
	]),

	route("/faq", "features/info/routes/faq.tsx"),
	route("/contributions", "features/info/routes/contributions.tsx"),
	route("/privacy-policy", "features/info/routes/privacy-policy.tsx"),
	route("/support", "features/info/routes/support.tsx"),

	route("/t", "features/team/routes/t.tsx"),
	route("/t/:customUrl", "features/team/routes/t.$customUrl.tsx", [
		index("features/team/routes/t.$customUrl.index.tsx"),
		route("edit", "features/team/routes/t.$customUrl.edit.tsx"),
		route("roster", "features/team/routes/t.$customUrl.roster.tsx"),
		route("join", "features/team/routes/t.$customUrl.join.tsx"),
		route("results", "features/team/routes/t.$customUrl.results.tsx"),
	]),

	...prefix("/vods", [
		index("features/vods/routes/vods.tsx"),
		route("new", "features/vods/routes/vods.new.tsx"),
		route(":id", "features/vods/routes/vods.$id.tsx"),
	]),

	...prefix("/builds", [
		index("features/builds/routes/builds.tsx"),
		...prefix(":slug", [
			index("features/builds/routes/builds.$slug.tsx"),
			route("stats", "features/build-stats/routes/builds.$slug.stats.tsx"),
			route("popular", "features/build-stats/routes/builds.$slug.popular.tsx"),
		]),
	]),

	...prefix("/xsearch", [
		index("features/top-search/routes/xsearch.tsx"),
		route("/player/:id", "features/top-search/routes/xsearch.player.$id.tsx"),
	]),

	route("/leaderboards", "features/leaderboards/routes/leaderboards.tsx"),

	route("/links", "features/links/routes/links.tsx"),

	...prefix("/art", [
		index("features/art/routes/art.tsx"),
		route("new", "features/art/routes/art.new.tsx"),
	]),

	...prefix("/q", [
		index("features/sendouq/routes/q.tsx"),
		route("rules", "features/sendouq/routes/q.rules.tsx"),
		route("info", "features/sendouq/routes/q.info.tsx"),
		route("looking", "features/sendouq/routes/q.looking.tsx"),
		route("preparing", "features/sendouq/routes/q.preparing.tsx"),
		route("match/:id", "features/sendouq-match/routes/q.match.$id.tsx"),
		route("settings", "features/sendouq-settings/routes/q.settings.tsx"),
		route("streams", "features/sendouq-streams/routes/q.streams.tsx"),
	]),
	route("/play", "features/sendouq/routes/play.ts"),

	route("/trusters", "features/sendouq/routes/trusters.ts"),

	route("/weapon-usage", "features/sendouq/routes/weapon-usage.ts"),

	route("/tiers", "features/sendouq/routes/tiers.tsx"),

	...prefix("/lfg", [
		index("features/lfg/routes/lfg.tsx"),
		route("new", "features/lfg/routes/lfg.new.tsx"),
	]),

	...prefix("/scrims", [
		index("features/scrims/routes/scrims.tsx"),
		route("new", "features/scrims/routes/scrims.new.tsx"),
		route(":id", "features/scrims/routes/scrims.$id.tsx"),
	]),

	route("/associations", "features/associations/routes/associations.tsx", [
		route(
			"/associations/new",
			"features/associations/routes/associations.new.tsx",
		),
	]),

	route("/admin", "features/admin/routes/admin.tsx"),

	...prefix("/a", [
		index("features/articles/routes/a.tsx"),
		route(":slug", "features/articles/routes/a.$slug.tsx"),
	]),

	route("/plus", "features/plus-suggestions/routes/plus.tsx", [
		index("features/plus-suggestions/routes/plus.index.ts"),
		route(
			"suggestions",
			"features/plus-suggestions/routes/plus.suggestions.tsx",
			[
				route(
					"/plus/suggestions/new",
					"features/plus-suggestions/routes/plus.suggestions.new.tsx",
				),
				route(
					"/plus/suggestions/comment/:tier/:userId",
					"features/plus-suggestions/routes/plus.suggestions.comment.$tier.$userId.tsx",
				),
			],
		),
		route("list", "features/plus-voting/routes/plus.list.ts"),
		route("voting", "features/plus-voting/routes/plus.voting.tsx"),
		route(
			"voting/results",
			"features/plus-voting/routes/plus.voting.results.tsx",
		),
	]),

	route("/patrons", "features/api-private/routes/patrons.ts"),
	route("/seed", "features/api-private/routes/seed.ts"),
	route("/users", "features/api-private/routes/users.ts"),

	...prefix("/api", [
		route(
			"/user/:identifier",
			"features/api-public/routes/user.$identifier.ts",
		),
		route(
			"/calendar/:year/:week",
			"features/api-public/routes/calendar.$year.$week.ts",
		),
		route(
			"/sendouq/active-match/:userId",
			"features/api-public/routes/sendouq.active-match.$userId.ts",
		),
		route(
			"/sendouq/match/:matchId",
			"features/api-public/routes/sendouq.match.$matchId.ts",
		),
		route("/tournament/:id", "features/api-public/routes/tournament.$id.ts"),
		route(
			"/tournament/:id/teams",
			"features/api-public/routes/tournament.$id.teams.ts",
		),
		route(
			"/tournament/:id/casted",
			"features/api-public/routes/tournament.$id.casted.ts",
		),
		route(
			"/tournament/:id/brackets/:bidx",
			"features/api-public/routes/tournament.$id.brackets.$bidx.ts",
		),
		route(
			"/tournament/:id/brackets/:bidx/standings",
			"features/api-public/routes/tournament.$id.brackets.$bidx.standings.ts",
		),
		route(
			"/tournament-match/:id",
			"features/api-public/routes/tournament-match.$id.ts",
		),
		route("/org/:id", "features/api-public/routes/org.$id.ts"),
	]),

	route("/short/:customUrl", "features/user-page/routes/short.$customUrl.ts"),

	route("/theme", "features/theme/routes/theme.ts"),

	...prefix("/auth", [
		index("features/auth/routes/auth.ts"),
		route("callback", "features/auth/routes/auth.callback.ts"),
		route("create-link", "features/auth/routes/auth.create-link.ts"),
		route("login", "features/auth/routes/auth.login.ts"),
		route("logout", "features/auth/routes/auth.logout.ts"),
		route("impersonate", "features/auth/routes/auth.impersonate.ts"),
		route("impersonate/stop", "features/auth/routes/auth.impersonate.stop.ts"),
	]),
	...devOnlyRoutes,
] satisfies RouteConfig;
