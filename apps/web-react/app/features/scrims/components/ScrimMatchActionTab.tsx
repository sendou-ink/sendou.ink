import { MapPin, Repeat, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { useUser } from "~/features/auth/core/user";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import * as Scrim from "../core/Scrim";
import * as ScrimMapByMap from "../core/ScrimMapByMap";
import type { loader } from "../loaders/scrims.$id.server";
import { scrimIdActionSchema } from "../scrims-schemas";
import type { ScrimSide } from "../scrims-types";
import { PickMapDialog } from "./PickMapDialog";
import { ScrimMapListManager } from "./ScrimMapListManager";
import styles from "./ScrimMatchActionTab.module.css";

const ALPHA_TEAM_ID = 1;
const BRAVO_TEAM_ID = 2;

export function ScrimMatchActionTab() {
	const data = useLoaderData<typeof loader>();
	const user = useUser();

	const viewerSide = user ? Scrim.sideOfUser(data.post, user.id) : null;

	if (data.mapByMap.locked) return null;
	if (!viewerSide) return <NotParticipantSection />;

	if (!data.mapByMap.currentMap) {
		return (
			<SendouTabPanel id={TAB_KEYS.ACTION}>
				<ScrimMapListManager viewerSide={viewerSide} standalone />
			</SendouTabPanel>
		);
	}

	return <ReportMapSection viewerSide={viewerSide} />;
}

function NotParticipantSection() {
	const { t } = useTranslation(["scrims"]);
	return (
		<SendouTabPanel id={TAB_KEYS.ACTION}>
			<div className={styles.locked}>
				{t("scrims:mapByMap.nonParticipantNotice")}
			</div>
		</SendouTabPanel>
	);
}

function ReportMapSection({ viewerSide }: { viewerSide: ScrimSide }) {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();
	const reportMap = useActionSubmit(scrimIdActionSchema);
	const map = data.mapByMap!.currentMap!;
	const acceptedRequest = data.post.requests.find((r) => r.isAccepted)!;

	const alphaName = data.post.team
		? Scrim.sideDisplayName(data.post)
		: t("q:match.groupAlpha");
	const bravoName = acceptedRequest.team
		? Scrim.sideDisplayName(acceptedRequest)
		: t("q:match.groupBravo");

	const ownTeamId = viewerSide === "ALPHA" ? ALPHA_TEAM_ID : BRAVO_TEAM_ID;

	return (
		<MatchActionTab
			key={map.id}
			teams={[
				{ id: ALPHA_TEAM_ID, name: alphaName },
				{ id: BRAVO_TEAM_ID, name: bravoName },
			]}
			ownTeamId={ownTeamId}
			stageId={map.stageId}
			mode={map.mode}
			withKo={false}
			isSubmitting={reportMap.state !== "idle"}
			onSubmit={({ winnerId }) => {
				reportMap.submit("REPORT_MAP", {
					mapId: map.id,
					winnerSide: winnerId === ALPHA_TEAM_ID ? "ALPHA" : "BRAVO",
				});
			}}
			actionButtons={<MapActionButtons />}
			secondaryAction={<ScrimMapListManager viewerSide={viewerSide} />}
		/>
	);
}

function MapActionButtons() {
	const { t } = useTranslation(["scrims"]);
	const data = useLoaderData<typeof loader>();
	const undoMap = useActionSubmit(scrimIdActionSchema);
	const replayMap = useActionSubmit(scrimIdActionSchema);

	const maps = data.mapByMap?.maps ?? [];
	const currentMap = data.mapByMap?.currentMap;
	const latest = Scrim.lastReportedMap(maps);
	const undoAllowed = ScrimMapByMap.canUndo(latest, maps);
	const replayAllowed = Boolean(latest && currentMap);

	return (
		<>
			<SendouButton
				testId="undo-map-button"
				variant="minimal-destructive"
				size="miniscule"
				icon={<Undo2 size={16} />}
				isPending={undoMap.state !== "idle"}
				isDisabled={!undoAllowed}
				onPress={() => {
					undoMap.submit("UNDO_MAP");
				}}
			>
				{t("scrims:mapByMap.undo")}
			</SendouButton>
			<SendouButton
				testId="replay-map-button"
				variant="minimal"
				size="miniscule"
				icon={<Repeat size={16} />}
				isPending={replayMap.state !== "idle"}
				isDisabled={!replayAllowed}
				onPress={() => {
					replayMap.submit("REPLAY_MAP");
				}}
			>
				{t("scrims:mapByMap.replay")}
			</SendouButton>
			<PickMapDialog
				key={
					currentMap
						? `${currentMap.id}-${currentMap.mode}-${currentMap.stageId}`
						: "no-map"
				}
				heading={t("scrims:mapByMap.pickDialog.heading")}
				trigger={
					<SendouButton
						testId="pick-map-button"
						variant="minimal"
						size="miniscule"
						icon={<MapPin size={16} />}
					>
						{t("scrims:mapByMap.pick")}
					</SendouButton>
				}
			/>
		</>
	);
}
