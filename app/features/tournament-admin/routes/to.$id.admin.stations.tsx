import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { InfoPopover } from "~/components/InfoPopover";
import { useTournament } from "~/features/tournament/tournament-context";
import { stationsFormSchema } from "~/features/tournament-stations/tournament-stations-schemas";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import type { loader } from "../loaders/to.$id.admin.stations.server";

type LoadedStation = Awaited<ReturnType<typeof loader>>["stations"][number];

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
				// deleting a station with queued matches asks first, see SubmitWithDeleteConfirm
				hideSubmitButtonWhen={(values) =>
					deletedStationsWithMatches(stations, values.stations).length > 0
				}
				defaultValues={{
					loadedStationIds: stations.map((station) => station.id),
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
						<SubmitWithDeleteConfirm stations={stations} />
					</>
				)}
			</SendouForm>
		</div>
	);
}

function SubmitWithDeleteConfirm({ stations }: { stations: LoadedStation[] }) {
	const { t } = useTranslation(["tournament", "forms"]);
	const { values, submitToServer } = useFormFieldContext();

	const deleted = deletedStationsWithMatches(
		stations,
		values.stations as Array<{ stationId?: unknown }> | undefined,
	);
	if (deleted.length === 0) return null;

	return (
		<div className="mt-4 stack horizontal md mx-auto justify-center items-center">
			<FormWithConfirm
				dialogHeading={t("tournament:stations.deleteConfirm.heading")}
				description={t("tournament:stations.deleteConfirm.description", {
					stations: deleted.map((station) => station.name).join(", "),
				})}
				submitButtonText={t("tournament:stations.deleteConfirm.submit")}
				onConfirm={() => submitToServer(values)}
			>
				<SendouButton testId="save-stations-button">
					{t("forms:submit")}
				</SendouButton>
			</FormWithConfirm>
		</div>
	);
}

function deletedStationsWithMatches(
	stations: LoadedStation[],
	values: Array<{ stationId?: unknown }> | undefined,
) {
	const keptIds = new Set((values ?? []).map((value) => value.stationId));

	return stations.filter(
		(station) => station.hasQueuedMatches && !keptIds.has(station.id),
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
					<li>{t("tournament:stations.autoAssign.idle")}</li>
					<li>{t("tournament:stations.autoAssign.waiting")}</li>
					<li>{t("tournament:stations.autoAssign.manual")}</li>
				</ul>
			</div>
		</InfoPopover>
	);
}
