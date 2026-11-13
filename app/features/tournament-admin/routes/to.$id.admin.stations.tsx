import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { InfoPopover } from "~/components/InfoPopover";
import { useTournament } from "~/features/tournament/tournament-context";
import { stationsFormSchema } from "~/features/tournament-stations/tournament-stations-schemas";
import { SendouForm } from "~/form/SendouForm";
import type { loader } from "../loaders/to.$id.admin.stations.server";

export { action } from "../actions/to.$id.admin.stations.server";
export { loader } from "../loaders/to.$id.admin.stations.server";

export default function TournamentAdminStationsPage() {
	const { t } = useTranslation(["tournament"]);
	const { stations } = useLoaderData<typeof loader>();
	const tournament = useTournament();

	return (
		<div className="stack md">
			<p className="text-sm text-lighter">
				{t("tournament:stations.explanation")}
			</p>
			<SendouForm
				// new stations get their ids on save, a stale form would recreate them on the next one
				key={stations.map((station) => station.id).join(",")}
				schema={stationsFormSchema}
				fullWidth
				submitButtonTestId="save-stations-button"
				defaultValues={{
					autoAssign: tournament.autoAssignsStations,
					stations: stations.map((station) => ({
						stationId: station.id,
						name: station.name,
						locationNote: station.locationNote,
					})),
				}}
			>
				{({ FormField }) => (
					<>
						<FormField
							name="autoAssign"
							labelPopover={<AutoAssignInfoPopover />}
						/>
						<FormField name="stations" />
					</>
				)}
			</SendouForm>
		</div>
	);
}

function AutoAssignInfoPopover() {
	const { t } = useTranslation(["tournament"]);

	return (
		<InfoPopover tiny>
			<div className="stack xs text-sm">
				<div>{t("tournament:stations.autoAssign.intro")}</div>
				<ul className="stack xs">
					<li>{t("tournament:stations.autoAssign.order")}</li>
					<li>{t("tournament:stations.autoAssign.stay")}</li>
					<li>{t("tournament:stations.autoAssign.lowest")}</li>
					<li>{t("tournament:stations.autoAssign.waiting")}</li>
					<li>{t("tournament:stations.autoAssign.manual")}</li>
				</ul>
			</div>
		</InfoPopover>
	);
}
