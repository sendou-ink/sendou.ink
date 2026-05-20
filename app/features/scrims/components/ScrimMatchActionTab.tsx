import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { useUser } from "~/features/auth/core/user";
import * as Scrim from "../core/Scrim";
import * as ScrimMapByMap from "../core/ScrimMapByMap";
import type { loader } from "../loaders/scrims.$id.server";
import type { ScrimSide } from "../scrims-types";
import { ScrimMapListForm } from "./ScrimMapListForm";
import styles from "./ScrimMatchActionTab.module.css";

const ALPHA_TEAM_ID = 1;
const BRAVO_TEAM_ID = 2;

export function ScrimMatchActionTab() {
	const data = useLoaderData<typeof loader>();
	const user = useUser();

	const viewerSide = user ? Scrim.sideOfUser(data.post, user.id) : null;

	if (!data.mapByMap) return <EnableTrackingSection />;
	if (data.mapByMap.locked) return <LockedSection />;
	if (!viewerSide) return <NotParticipantSection />;

	const ownList = data.mapByMap.mapLists.find((l) => l.side === viewerSide);
	if (!ownList) {
		return <SubmitFirstListSection viewerSide={viewerSide} />;
	}

	if (!data.mapByMap.currentMap) {
		return <GenerateNextMapSection viewerSide={viewerSide} />;
	}

	return <ReportMapSection viewerSide={viewerSide} />;
}

function EnableTrackingSection() {
	const { t } = useTranslation(["scrims"]);
	const fetcher = useFetcher();

	return (
		<SendouTabPanel id={TAB_KEYS.ACTION}>
			<div className={styles.root}>
				<p className={styles.intro}>
					{t("scrims:mapByMap.enable.explanation")}
				</p>
				<SendouButton
					testId="enable-tracking-button"
					isDisabled={fetcher.state !== "idle"}
					onPress={() => {
						fetcher.submit({ _action: "ENABLE_TRACKING" }, { method: "post" });
					}}
				>
					{t("scrims:mapByMap.enable.button")}
				</SendouButton>
			</div>
		</SendouTabPanel>
	);
}

function LockedSection() {
	const { t } = useTranslation(["scrims"]);
	return (
		<SendouTabPanel id={TAB_KEYS.ACTION}>
			<div className={styles.locked}>{t("scrims:mapByMap.locked")}</div>
		</SendouTabPanel>
	);
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

function SubmitFirstListSection({ viewerSide }: { viewerSide: ScrimSide }) {
	const { t } = useTranslation(["scrims"]);
	return (
		<SendouTabPanel id={TAB_KEYS.ACTION}>
			<div className={styles.root}>
				<p className={styles.intro}>{t("scrims:mapByMap.submitList.intro")}</p>
				<ScrimMapListForm viewerSide={viewerSide} />
				<MapListsSummary viewerSide={viewerSide} />
			</div>
		</SendouTabPanel>
	);
}

function GenerateNextMapSection({ viewerSide }: { viewerSide: ScrimSide }) {
	const { t } = useTranslation(["scrims"]);
	const fetcher = useFetcher();
	return (
		<SendouTabPanel id={TAB_KEYS.ACTION}>
			<div className={styles.root}>
				<SendouButton
					testId="reveal-next-map-button"
					isDisabled={fetcher.state !== "idle"}
					onPress={() => {
						fetcher.submit(
							{ _action: "GENERATE_NEXT_MAP" },
							{ method: "post" },
						);
					}}
				>
					{t("scrims:mapByMap.revealNextMap")}
				</SendouButton>
				<ReplayAndUndoButtons />
				<MapListsSummary viewerSide={viewerSide} />
			</div>
		</SendouTabPanel>
	);
}

function ReportMapSection({ viewerSide }: { viewerSide: ScrimSide }) {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();
	const fetcher = useFetcher();
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
			teams={[
				{ id: ALPHA_TEAM_ID, name: alphaName },
				{ id: BRAVO_TEAM_ID, name: bravoName },
			]}
			ownTeamId={ownTeamId}
			stageId={map.stageId}
			mode={map.mode}
			withPoints={false}
			isSubmitting={fetcher.state !== "idle"}
			onSubmit={({ winnerId }) => {
				fetcher.submit(
					{
						_action: "REPORT_MAP",
						mapId: String(map.id),
						winnerSide: winnerId === ALPHA_TEAM_ID ? "ALPHA" : "BRAVO",
					},
					{ method: "post" },
				);
			}}
			actionButtons={<ReplayAndUndoButtons />}
		/>
	);
}

function ReplayAndUndoButtons() {
	const { t } = useTranslation(["scrims"]);
	const data = useLoaderData<typeof loader>();
	const fetcher = useFetcher();

	const latest = Scrim.lastReportedMap(data.mapByMap?.maps ?? []);
	const undoAllowed = ScrimMapByMap.canUndo(latest, data.mapByMap?.maps ?? []);
	const replayAllowed = latest && !data.mapByMap?.currentMap;

	if (!undoAllowed && !replayAllowed) return null;

	return (
		<div className={styles.aux}>
			{undoAllowed ? (
				<SendouButton
					testId="undo-map-button"
					variant="outlined"
					size="small"
					isDisabled={fetcher.state !== "idle"}
					onPress={() => {
						fetcher.submit({ _action: "UNDO_MAP" }, { method: "post" });
					}}
				>
					{t("scrims:mapByMap.undo")}
				</SendouButton>
			) : null}
			{replayAllowed ? (
				<SendouButton
					testId="replay-map-button"
					variant="outlined"
					size="small"
					isDisabled={fetcher.state !== "idle"}
					onPress={() => {
						fetcher.submit({ _action: "REPLAY_MAP" }, { method: "post" });
					}}
				>
					{t("scrims:mapByMap.replay")}
				</SendouButton>
			) : null}
		</div>
	);
}

function MapListsSummary({ viewerSide }: { viewerSide: ScrimSide }) {
	const { t } = useTranslation(["scrims", "q"]);
	const data = useLoaderData<typeof loader>();
	const lists = data.mapByMap?.mapLists ?? [];

	const sides: ScrimSide[] = ["ALPHA", "BRAVO"];

	return (
		<div className={styles.mapListsSummary}>
			{sides.map((side) => {
				const list = lists.find((l) => l.side === side);
				const isOwn = side === viewerSide;
				return (
					<div
						key={side}
						className={styles.mapListRow}
						data-testid={`map-list-row-${side}`}
					>
						<div className={styles.mapListRowHeader}>
							<span>
								{side === "ALPHA"
									? t("q:match.sides.alpha")
									: t("q:match.sides.bravo")}
							</span>
							{isOwn && list ? <ReplaceOwnListLink /> : null}
						</div>
						{list ? (
							<MapListDisplay
								source={list.source}
								tournamentId={list.tournamentId}
								serializedPool={list.serializedPool}
							/>
						) : (
							<span className={styles.mapListRowMissing}>
								{t("scrims:mapByMap.noListYet")}
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

function ReplaceOwnListLink() {
	const { t } = useTranslation(["scrims"]);
	const fetcher = useFetcher();
	return (
		<SendouButton
			testId="remove-list-button"
			variant="minimal-destructive"
			size="miniscule"
			isDisabled={fetcher.state !== "idle"}
			onPress={() => {
				fetcher.submit({ _action: "REMOVE_MAP_LIST" }, { method: "post" });
			}}
		>
			{t("scrims:mapByMap.removeList")}
		</SendouButton>
	);
}

function MapListDisplay({
	source,
	tournamentId,
	serializedPool,
}: {
	source: "TOURNAMENT" | "POOL";
	tournamentId: number | null;
	serializedPool: string | null;
}) {
	const { t } = useTranslation(["scrims"]);
	if (source === "TOURNAMENT") {
		return (
			<span>
				{t("scrims:mapByMap.tournamentList", {
					id: tournamentId ?? "?",
				})}
			</span>
		);
	}
	return (
		<span>
			{t("scrims:mapByMap.poolList", {
				pool: serializedPool?.slice(0, 32) ?? "",
			})}
		</span>
	);
}
