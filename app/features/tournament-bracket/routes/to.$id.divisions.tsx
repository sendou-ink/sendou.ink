import type { SerializeFrom } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { UsersIcon } from "../../../components/icons/Users";
import { tournamentBracketsPage } from "../../../utils/urls";
import { loader } from "../loader/to.$id.divisions.server";
export { loader };

export default function TournamentDivisionsPage() {
	const data = useLoaderData<typeof loader>();

	if (data.divisions.length === 0) {
		return (
			<div className="text-center text-lg font-semi-bold text-lighter">
				Divisions have not been released yet, check back later
			</div>
		);
	}

	return (
		<div className="stack horizontal md flex-wrap">
			{data.divisions.map((div) => (
				<DivisionLink key={div.tournamentId} div={div} />
			))}
		</div>
	);
}

function DivisionLink({
	div,
}: { div: SerializeFrom<typeof loader>["divisions"][number] }) {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["calendar"]);
	const shortName = div.name.split("-").at(-1);

	return (
		<Link
			to={tournamentBracketsPage({ tournamentId: div.tournamentId })}
			className={clsx("tournament__div__link", {
				tournament__div__link__participant: data.divsParticipantOf.includes(
					div.tournamentId,
				),
			})}
		>
			{shortName}
			<div className="tournament__div__participant-counts">
				<UsersIcon />{" "}
				{t("calendar:count.teams", {
					count: div.teamsCount,
				})}
			</div>
		</Link>
	);
}
