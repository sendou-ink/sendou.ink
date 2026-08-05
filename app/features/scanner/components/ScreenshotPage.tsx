import { useCallback, useEffect, useRef, useState } from "react";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { useSearchParam } from "~/modules/search-params/hooks";
import { mainWeaponImageUrl } from "~/utils/urls";
import { CANONICAL_HEIGHT, CANONICAL_WIDTH, type Roi } from "../core/canonical";
import type { DeathData } from "../core/detectors/death/index";
import * as death from "../core/detectors/death/rois";
import type { MapStartData } from "../core/detectors/map-start/index";
import * as mapStart from "../core/detectors/map-start/rois";
import type { MinimapData } from "../core/detectors/minimap/index";
import * as minimap from "../core/detectors/minimap/rois";
import type { ScoreboardRowDebug } from "../core/detectors/scoreboard/index";
import * as sb from "../core/detectors/scoreboard/rois";
import type { ScoreboardOwnData } from "../core/detectors/scoreboard-own/index";
import * as own from "../core/detectors/scoreboard-own/rois";
import * as replay from "../core/detectors/scoreboard-replay/rois";
import type { DetectedEvent } from "../core/detectors/types";
import { scannerSearchParams } from "../scanner-search-params";
import { claimInspectFrame } from "../store/inspect";
import { AnalyzerClient } from "../worker/client";
import type { WorkerResponse } from "../worker/protocol";
import { downloadEventsCsv } from "./events-csv";
import { type CardData, downloadExpectedJson } from "./fixture-export";
import {
	lobbyLabel,
	mainWeaponLabel,
	modeLabel,
	stageLabel,
	weaponLabel,
} from "./labels";

type Result = Extract<WorkerResponse, { kind: "result" }>;

/** Draw a ROI crop from the normalized frame, scaled up. */
function RoiCrop(props: {
	frame: HTMLCanvasElement;
	roi: Roi;
	scale?: number;
}) {
	const { frame, roi, scale = 1.5 } = props;
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current!;
		canvas.width = Math.round(roi.w * scale);
		canvas.height = Math.round(roi.h * scale);
		const ctx = canvas.getContext("2d")!;
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(
			frame,
			roi.x,
			roi.y,
			roi.w,
			roi.h,
			0,
			0,
			canvas.width,
			canvas.height,
		);
	}, [frame, roi.x, roi.y, roi.w, roi.h, scale]);
	return <canvas ref={ref} />;
}

/** Per-row parse ROIs, in the same order as the event's players array. */
interface RowRois {
	weapon: Roi;
	name: Roi;
	paint: Roi;
	stats: [Roi, Roi, Roi];
}

function scoreboardRows(): RowRois[] {
	return sb.ROW_CENTERS.map((cy) => ({
		weapon: sb.weaponRoi(cy),
		name: sb.nameRoi(cy),
		paint: sb.paintRoi(cy),
		stats: [sb.statRoi(cy, 0), sb.statRoi(cy, 1), sb.statRoi(cy, 2)],
	}));
}

/** winnerSide comes from the event debug: players are ordered winners-first. */
function replayRows(winnerSide: string): RowRois[] {
	const panels =
		winnerSide === "right" ? [replay.PANEL_DX, 0] : [0, replay.PANEL_DX];
	return panels.flatMap((dx) =>
		replay.ROW_CENTERS.map((cy) => ({
			weapon: replay.weaponRoi(cy, dx),
			name: replay.nameRoi(cy, dx),
			paint: replay.paintRoi(cy, dx),
			stats: [
				replay.statRoi(cy, dx, 0),
				replay.statRoi(cy, dx, 1),
				replay.statRoi(cy, dx, 2),
			] as [Roi, Roi, Roi],
		})),
	);
}

function drawOverlay(ctx: CanvasRenderingContext2D, detector: string) {
	const rect = (roi: Roi, color: string) => {
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.strokeRect(roi.x, roi.y, roi.w, roi.h);
	};
	if (detector === "death") {
		rect(death.SPLAT_LINE1_ROI, "#34d399");
		rect(death.WEAPON_LINE_ROI, "#f87171");
		for (let row = 0; row < death.ABILITY_ROWS; row++) {
			rect(death.abilityMainRoi(row), "#60a5fa");
			for (const slot of [0, 1, 2])
				rect(death.abilitySubRoi(row, slot), "#e879f9");
		}
		rect(death.TAG_NAME_OUTER, "#4ade80");
		for (const roi of [
			...death.GATE_BURST_PROBES,
			...death.GATE_PANEL_PROBES,
		]) {
			rect(roi, "#facc15");
		}
		return;
	}
	if (detector === "map-start") {
		rect(mapStart.MODE_LABEL_ROI, "#34d399");
		rect(mapStart.MODE_BLOCK_ROI, "#f87171");
		rect(mapStart.STAGE_ROI, "#60a5fa");
		rect(mapStart.GATE_INK_BAND, "#e879f9");
		for (const roi of mapStart.GATE_DARK_PROBES) rect(roi, "#facc15");
		return;
	}
	if (detector === "scoreboard-own") {
		rect(own.WEAPON_TITLE_BAND, "#f87171");
		for (let row = 0; row < own.GEAR_ROWS; row++) {
			rect(own.gearMainRoi(row), "#60a5fa");
			for (const slot of [0, 1, 2]) rect(own.gearSubRoi(row, slot), "#e879f9");
			rect(own.gateStripProbe(row), "#facc15");
		}
		for (const roi of [
			...own.GATE_PANEL_PROBES,
			...own.GATE_TITLE_TEXT_PROBES,
		]) {
			rect(roi, "#facc15");
		}
		rect(sb.HEADER_LOBBY_BAND, "#34d399");
		rect(sb.HEADER_LINE_BAND, "#34d399");
		return;
	}
	if (detector === "minimap") {
		for (const card of minimap.CARD_LAYOUTS) {
			rect(card.name, "#4ade80");
			rect(card.weapon, "#f87171");
			rect(card.subTile, "#22d3ee");
			for (const [cx, cy] of card.badges)
				rect(minimap.badgeRoi(cx, cy), "#60a5fa");
			rect(card.cross, "#e879f9");
		}
		for (const cy of minimap.ENEMY_ROW_CYS) {
			rect(minimap.enemyWeaponRoi(cy), "#f87171");
			rect(minimap.enemySubTileRoi(cy), "#22d3ee");
			for (const cx of minimap.ENEMY_BADGE_XS)
				rect(minimap.badgeRoi(cx, cy), "#60a5fa");
			rect(minimap.enemyCrossRoi(cy), "#e879f9");
		}
		for (const roi of [
			minimap.GATE_CLOSE_BRIGHT,
			minimap.GATE_SPAWN_BRIGHT,
			...minimap.GATE_CLOSE_DARK_PROBES,
			...minimap.GATE_SPAWN_DARK_PROBES,
		]) {
			rect(roi, "#facc15");
		}
		return;
	}
	if (detector === "scoreboard-replay") {
		for (const dx of replay.PANEL_XS) {
			for (const cy of replay.ROW_CENTERS) {
				rect(replay.weaponRoi(cy, dx), "#f87171");
				rect(replay.nameRoi(cy, dx), "#4ade80");
				rect(replay.paintRoi(cy, dx), "#60a5fa");
				for (const i of [0, 1, 2] as const)
					rect(replay.statRoi(cy, dx, i), "#e879f9");
				rect(replay.gateFlatProbe(cy, dx), "#facc15");
			}
			rect(replay.teamScoreRoi(dx), "#60a5fa");
			rect(replay.resultTagRoi(dx), "#fb923c");
		}
		for (const roi of replay.MATCH_SCORE_ROIS) rect(roi, "#60a5fa");
		for (const roi of replay.GATE_GAP_PROBES) rect(roi, "#facc15");
		rect(replay.HEADER_TOP_BAND, "#34d399");
		rect(replay.HEADER_BOTTOM_BAND, "#34d399");
		rect(replay.REPLAY_CODE_ROI, "#34d399");
		return;
	}
	for (const cy of sb.ROW_CENTERS) {
		rect(sb.weaponRoi(cy), "#f87171");
		rect(sb.nameRoi(cy), "#4ade80");
		rect(sb.paintRoi(cy), "#60a5fa");
		for (const i of [0, 1, 2] as const) rect(sb.statRoi(cy, i), "#e879f9");
		rect(sb.gateDarkProbe(cy), "#facc15");
	}
	for (const roi of sb.TEAM_SCORE_ROIS) rect(roi, "#60a5fa");
	for (const roi of sb.GATE_PANEL_PROBES) rect(roi, "#facc15");
	rect(sb.HEADER_LOBBY_BAND, "#34d399");
	rect(sb.HEADER_LINE_BAND, "#34d399");
}

export function ScreenshotPage() {
	const displayRef = useRef<HTMLCanvasElement>(null);
	const clientRef = useRef<AnalyzerClient | null>(null);
	const resultRef = useRef<(r: Result) => void>(() => {});
	const doneRef = useRef<() => void>(() => {});

	const [frame, setFrame] = useState<HTMLCanvasElement | null>(null);
	const [results, setResults] = useState<Record<string, Result>>({});
	const [busy, setBusy] = useState(false);
	const [over, setOver] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		clientRef.current = new AnalyzerClient(
			(r) => resultRef.current(r),
			(message) => {
				setError(message);
				setBusy(false);
			},
			() => doneRef.current(),
			// one-shot analyses: re-running the same screenshot must always parse
			{ suppressSteadyFrames: false },
		);
		return () => clientRef.current?.dispose();
	}, []);

	// the detector whose inspector/overlay is shown: the one that fired
	const active = Object.values(results).find((r) => r.events.length > 0);
	const activeDetector = active?.detector ?? "scoreboard";

	useEffect(() => {
		if (!frame) return;
		const display = displayRef.current!;
		display.width = CANONICAL_WIDTH;
		display.height = CANONICAL_HEIGHT;
		const ctx = display.getContext("2d")!;
		ctx.drawImage(frame, 0, 0);
		drawOverlay(ctx, activeDetector);
	}, [frame, activeDetector]);

	const analyze = useCallback(async (file: File | Blob) => {
		setError(null);
		setBusy(true);
		setResults({});
		try {
			const bitmap = await createImageBitmap(file);

			// normalized frame for local crop display, same as the pipeline does
			const norm = document.createElement("canvas");
			norm.width = CANONICAL_WIDTH;
			norm.height = CANONICAL_HEIGHT;
			norm
				.getContext("2d")!
				.drawImage(bitmap, 0, 0, CANONICAL_WIDTH, CANONICAL_HEIGHT);
			setFrame(norm);

			resultRef.current = (r) => {
				setResults((prev) => ({ ...prev, [r.detector]: r }));
			};
			doneRef.current = () => setBusy(false);
			const client = clientRef.current!;
			await client.whenReady();
			client.analyze(bitmap, 0);
		} catch (e) {
			setError(String(e));
			setBusy(false);
		}
	}, []);

	// frame handed off from an Inspect click in another browser tab; the
	// handoff write races this tab's load, so the claim polls briefly
	const [inspectKey, setInspectKey] = useSearchParam(
		scannerSearchParams,
		"inspect",
	);
	useEffect(() => {
		if (!inspectKey) return;
		setInspectKey(null);
		void claimInspectFrame(inspectKey).then((frame) => {
			if (frame) void analyze(frame);
		});
	}, [inspectKey, setInspectKey, analyze]);

	const event = active?.events[0] as DetectedEvent<CardData> | undefined;
	const rows = (event?.debug?.rows ?? []) as ScoreboardRowDebug[];
	const isReplay = activeDetector === "scoreboard-replay";
	const isDeath = activeDetector === "death";
	const isMapStart = activeDetector === "map-start";
	const isOwn = activeDetector === "scoreboard-own";
	const winnerSide = String(event?.debug?.winnerSide ?? "left");
	const rowRois = isReplay ? replayRows(winnerSide) : scoreboardRows();

	return (
		<div>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target; the file input inside is the accessible path */}
			<div
				className={`dropzone ${over ? "over" : ""}`}
				onDragOver={(e) => {
					e.preventDefault();
					setOver(true);
				}}
				onDragLeave={() => setOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setOver(false);
					const file = e.dataTransfer.files[0];
					if (file) void analyze(file);
				}}
			>
				Drop a frame (PNG/JPEG) here, or{" "}
				<label style={{ textDecoration: "underline", cursor: "pointer" }}>
					pick a file
					<input
						type="file"
						accept="image/png,image/jpeg"
						style={{ display: "none" }}
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = ""; // allow re-picking the same file
							if (file) void analyze(file);
						}}
					/>
				</label>
				{busy && " — analyzing…"}
			</div>
			{error && <p className="error">{error}</p>}

			<div
				className="screenshot-frame"
				style={{ display: frame ? "block" : "none" }}
			>
				<canvas ref={displayRef} />
			</div>

			{frame && !busy && (
				<p>
					<button
						type="button"
						onClick={() =>
							downloadExpectedJson(event?.data ?? null, event?.type)
						}
					>
						Download expected.json
					</button>{" "}
					<button
						type="button"
						disabled={!event}
						onClick={() =>
							downloadEventsCsv(
								"screenshot-events.csv",
								Object.values(results).flatMap((r) => r.events),
							)
						}
					>
						Download CSV
					</button>
				</p>
			)}

			{Object.values(results).map((result) => (
				<p key={result.detector}>
					{result.detector} gate:{" "}
					<b>{result.gate.pass ? "fired" : "no fire"}</b> (score{" "}
					{result.gate.score.toFixed(3)})
					{result.events[0] && result.detector === "death" && (
						<>
							{" · "}confidence{" "}
							{((result.events[0].confidence ?? 0) * 100).toFixed(1)}%{" · "}
							{(() => {
								const data = result.events[0].data as DeathData;
								return `splatted by ${weaponLabel(data.weaponType, data.weaponId) ?? "?"} (${data.name ?? "?"})`;
							})()}
						</>
					)}
					{result.events[0] && result.detector === "map-start" && (
						<>
							{" · "}confidence{" "}
							{((result.events[0].confidence ?? 0) * 100).toFixed(1)}%{" · "}
							{(() => {
								const data = result.events[0].data as MapStartData;
								return `${modeLabel(data.mode) ?? "?"} · ${stageLabel(data.stage) ?? "?"}`;
							})()}
						</>
					)}
					{result.events[0] && result.detector === "scoreboard-own" && (
						<>
							{" · "}confidence{" "}
							{((result.events[0].confidence ?? 0) * 100).toFixed(1)}%{" · "}
							{(() => {
								const data = result.events[0].data as ScoreboardOwnData;
								return `${[lobbyLabel(data.lobby), modeLabel(data.mode), stageLabel(data.stage)].map((v) => v ?? "?").join(" · ")} · ${mainWeaponLabel(data.weaponId) ?? "?"}`;
							})()}
						</>
					)}
					{result.events[0] && result.detector === "minimap" && (
						<>
							{" · "}confidence{" "}
							{((result.events[0].confidence ?? 0) * 100).toFixed(1)}%{" · "}
							{(() => {
								const data = result.events[0].data as MinimapData;
								const players = data.teammates
									.map((p) => p.name ?? "?")
									.join(", ");
								return `${data.stage ?? "?"} · ${players}`;
							})()}
						</>
					)}
					{result.events[0] &&
						result.detector !== "death" &&
						result.detector !== "map-start" &&
						result.detector !== "scoreboard-own" &&
						result.detector !== "minimap" && (
							<>
								{" · "}confidence{" "}
								{((result.events[0].confidence ?? 0) * 100).toFixed(1)}% ·
								scores{" "}
								{JSON.stringify((result.events[0].data as CardData).scores)}
								{" · "}
								{(() => {
									const data = result.events[0].data as CardData;
									return [
										lobbyLabel(data.lobby),
										modeLabel(data.mode),
										stageLabel(data.stage),
									]
										.map((v) => v ?? "?")
										.join(" · ");
								})()}
							</>
						)}
				</p>
			))}

			{frame && event && isReplay && (
				<p>
					timestamp <b>{event.data.timestamp ?? "?"}</b>
					{" · "}code <b>{event.data.replayCode ?? "?"}</b>{" "}
					<span className="score">
						(raw: {String(event.debug?.codeRaw ?? "")})
					</span>
					{" · "}match scores {JSON.stringify(event.data.matchScores)}
					{" · "}winner panel <b>{winnerSide}</b>
					<br />
					<RoiCrop frame={frame} roi={replay.HEADER_TOP_BAND} />{" "}
					<RoiCrop frame={frame} roi={replay.REPLAY_CODE_ROI} />
				</p>
			)}

			{frame && event && isDeath && (
				<p>
					{(() => {
						const data = event.data as unknown as DeathData;
						return (
							<>
								weapon{" "}
								<b>{weaponLabel(data.weaponType, data.weaponId) ?? "?"}</b>{" "}
								<span className="score">
									(raw: {String(event.debug?.weaponRaw ?? "")})
								</span>
								{" · "}name <b>{data.name ?? "?"}</b>{" "}
								<span className="score">
									(raw: {String(event.debug?.nameRaw ?? "")})
								</span>
								{" · "}abilities{" "}
								{data.abilities.map((row) => row.join(" ")).join(" | ")}
								<br />
								<RoiCrop frame={frame} roi={death.WEAPON_LINE_ROI} />{" "}
								<RoiCrop frame={frame} roi={death.TAG_NAME_OUTER} />
							</>
						);
					})()}
				</p>
			)}

			{frame && event && isMapStart && (
				<p>
					{(() => {
						const data = event.data as unknown as MapStartData;
						return (
							<>
								mode <b>{modeLabel(data.mode) ?? "?"}</b>{" "}
								<span className="score">
									(raw: {String(event.debug?.modeReading ?? "")})
								</span>
								{" · "}stage <b>{stageLabel(data.stage) ?? "?"}</b>{" "}
								<span className="score">
									(raw: {String(event.debug?.stageReading ?? "")})
								</span>
								<br />
								<RoiCrop
									frame={frame}
									roi={mapStart.MODE_BLOCK_ROI}
									scale={0.75}
								/>{" "}
								<RoiCrop frame={frame} roi={mapStart.STAGE_ROI} />
							</>
						);
					})()}
				</p>
			)}

			{frame && event && isOwn && (
				<p>
					{(() => {
						const data = event.data as unknown as ScoreboardOwnData;
						return (
							<>
								weapon <b>{mainWeaponLabel(data.weaponId) ?? "?"}</b>{" "}
								<span className="score">
									(raw: {String(event.debug?.weaponReading ?? "")})
								</span>
								{" · "}abilities{" "}
								{data.abilities.map((row) => row.join(" ")).join(" | ")}
								<br />
								<RoiCrop frame={frame} roi={own.WEAPON_TITLE_BAND} />{" "}
								{[0, 1, 2].map((row) => (
									<RoiCrop
										key={row}
										frame={frame}
										roi={{
											x: own.GEAR_MAIN_CXS[row]! - 36,
											y: own.GEAR_BADGE_CY - 32,
											w: 200,
											h: 64,
										}}
									/>
								))}
							</>
						);
					})()}
				</p>
			)}

			{frame && event && !isDeath && !isMapStart && !isOwn && (
				<table className="inspector">
					<thead>
						<tr>
							<th>row</th>
							<th>weapon crop</th>
							<th>top candidates</th>
							<th>name</th>
							<th>paint</th>
							<th>stats (splats / deaths / specials)</th>
						</tr>
					</thead>
					<tbody>
						{rowRois.map((roi, i) => {
							const player = event.data.players[i];
							const dbg = rows[i];
							return (
								<tr key={i}>
									<td>{i}</td>
									<td>
										<RoiCrop frame={frame} roi={roi.weapon} />
									</td>
									<td>
										<div className="candidates">
											{dbg?.weapon?.top.map((c) => (
												<span className="cand" key={c.id}>
													<img
														className="weapon-icon"
														src={`${mainWeaponImageUrl(Number(c.id) as MainWeaponId)}.avif`}
														alt={c.id}
													/>
													{c.id}
													<span className="score">{c.score.toFixed(3)}</span>
												</span>
											))}
										</div>
									</td>
									<td>
										<RoiCrop frame={frame} roi={roi.name} />
										<b>{player?.name || "—"}</b>{" "}
										<span className="score">{dbg?.nameScore.toFixed(3)}</span>
									</td>
									<td>
										<RoiCrop frame={frame} roi={roi.paint} />
										<b>{player?.paint ?? "—"}</b>{" "}
										<span className="score">{dbg?.paintScore.toFixed(3)}</span>
									</td>
									<td>
										<div className="candidates">
											{([0, 1, 2] as const).map((s) => (
												<span className="cand" key={s}>
													<RoiCrop frame={frame} roi={roi.stats[s]} scale={2} />
													<b>{[player?.ka, player?.d, player?.s][s] ?? "—"}</b>
													<span className="score">
														{dbg?.statScores[s].toFixed(2)}
													</span>
												</span>
											))}
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			)}
		</div>
	);
}
