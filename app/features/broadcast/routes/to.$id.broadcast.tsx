import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { SendouSection } from "~/components/elements/Section";
import { STREAM_PLATFORM_NAMES } from "~/features/live-streams/live-streams-constants";
import { useTournament } from "~/features/tournament/tournament-context";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { tournamentAdminPage } from "~/utils/urls";
import { broadcastDashboardPage } from "../broadcast-urls";
import { loader } from "../loaders/to.$id.broadcast.server";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["broadcast"],
};

export default function TournamentBroadcastsPage() {
	const { t } = useTranslation(["broadcast"]);
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();

	return (
		<SendouSection title={t("broadcast:title")}>
			<div className="stack md">
				<p className="text-sm text-lighter">
					{t("broadcast:list.description")}
				</p>
				{data.channels.length === 0 ? (
					<p>{t("broadcast:list.noChannels")}</p>
				) : (
					<ul className="stack sm">
						{data.channels.map((channel) => (
							<li key={channel.slug}>
								<Link
									to={broadcastDashboardPage({
										tournamentId: tournament.ctx.id,
										slug: channel.slug,
									})}
								>
									{channel.name}
								</Link>{" "}
								<span className="text-xs text-lighter">
									({STREAM_PLATFORM_NAMES[channel.platform]})
								</span>
							</li>
						))}
					</ul>
				)}
				<Link
					to={`${tournamentAdminPage(tournament.ctx.id)}/stream`}
					className="text-sm"
				>
					{t("broadcast:list.addChannels")}
				</Link>
			</div>
		</SendouSection>
	);
}
