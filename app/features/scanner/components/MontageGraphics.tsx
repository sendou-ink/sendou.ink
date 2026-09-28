/**
 * The montage's cards and clip ribbons, built from the image export's
 * graphic blocks (`~/features/img-export`) so the video matches the
 * exported result images. The renderer (and the results image download)
 * asks for one at a time through `setMontageGraphicCapture`: the stage
 * mounts it off screen in the dark theme, snapdom rasterizes it (the video's
 * at the scale that makes them full-HD sized) and it unmounts again.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Avatar } from "~/components/Avatar";
import { WeaponImage } from "~/components/Image";
import {
	GraphicBoxLabel,
	GraphicContainer,
	GraphicFooter,
	GraphicPlacementCell,
	GraphicSiteUrl,
	GraphicStat,
	GraphicStatsRow,
	GraphicTeamRow,
	GraphicTeamsList,
} from "~/features/img-export/components/Graphic";
import { TournamentGraphicHeader } from "~/features/img-export/components/TournamentResultsGraphic";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { tournamentPage } from "~/utils/urls";
import type { MontageManifest, MontageManifestVod } from "../core/montage";
import styles from "./MontageGraphics.module.css";
import {
	type MontageGraphic,
	montageImageUrl,
	setMontageGraphicCapture,
} from "./montage";

/** the full-frame graphics' CSS size times this is 1920×1080 */
const FRAME_SCALE: Record<"title" | "standings", number> = {
	title: 2.4,
	standings: 1.2,
};
const RIBBON_SCALE = 1.25;
/** the image export's own scale (ImageExportDialog.tsx) */
const RESULTS_SCALE = 1.75;
const TOP_TEAMS_WITH_PLAYERS_IN_VIDEO = 3;

interface CaptureRequest {
	graphic: MontageGraphic;
	resolve: (image: Blob) => void;
	reject: (error: unknown) => void;
}

export function MontageGraphicStage({
	manifest,
	comps,
}: {
	manifest: MontageManifest;
	/** by team id */
	comps: ReadonlyMap<number, MainWeaponId[]>;
}) {
	const [request, setRequest] = React.useState<CaptureRequest | null>(null);
	const graphicRef = React.useRef<HTMLDivElement>(null);

	// the renderer runs outside React and asks for its graphics one at a time
	React.useEffect(() => {
		setMontageGraphicCapture(
			(graphic) =>
				new Promise((resolve, reject) =>
					setRequest({ graphic, resolve, reject }),
				),
		);
		return () => setMontageGraphicCapture(null);
	}, []);

	// capture once the requested graphic has committed to the DOM
	React.useEffect(() => {
		if (!request || !graphicRef.current) return;
		const scale =
			request.graphic.kind === "ribbon"
				? RIBBON_SCALE
				: request.graphic.kind === "results"
					? RESULTS_SCALE
					: FRAME_SCALE[request.graphic.kind];
		captureImage(graphicRef.current, scale)
			.then(request.resolve, request.reject)
			// the next request can arrive before this settles: only this one is dropped
			.finally(() =>
				setRequest((current) => (current === request ? null : current)),
			);
	}, [request]);

	if (!request) return null;

	return createPortal(
		<div className={styles.stage} data-theme="dark" aria-hidden>
			<div ref={graphicRef} className={styles.graphic}>
				{request.graphic.kind === "title" ? (
					<TitleGraphic manifest={manifest} />
				) : request.graphic.kind === "standings" ? (
					<Frame scale={FRAME_SCALE.standings}>
						<ResultsCard
							manifest={manifest}
							comps={comps}
							rosterCount={TOP_TEAMS_WITH_PLAYERS_IN_VIDEO}
							width={880}
						/>
					</Frame>
				) : request.graphic.kind === "results" ? (
					<ResultsCard
						manifest={manifest}
						comps={comps}
						rosterCount={manifest.topTeams.length}
					/>
				) : (
					<RibbonGraphic
						vod={request.graphic.vod}
						weaponId={request.graphic.weaponId}
					/>
				)}
			</div>
		</div>,
		document.body,
	);
}

function TitleGraphic({ manifest }: { manifest: MontageManifest }) {
	return (
		<Frame scale={FRAME_SCALE.title}>
			<GraphicContainer width={640}>
				<Header manifest={manifest} />
				<GraphicStatsRow>
					<GraphicStat label="Teams">{manifest.teamsCount}</GraphicStat>
					<GraphicStat label="Players">{manifest.playersCount}</GraphicStat>
				</GraphicStatsRow>
				<GraphicFooter>
					<div>Highlights</div>
					<GraphicSiteUrl path={tournamentPage(manifest.tournamentId)} />
				</GraphicFooter>
			</GraphicContainer>
		</Frame>
	);
}

/** The results image export's layout: the top teams with their comps, rosters for the first `rosterCount`. */
function ResultsCard({
	manifest,
	comps,
	rosterCount,
	width,
}: {
	manifest: MontageManifest;
	comps: ReadonlyMap<number, MainWeaponId[]>;
	rosterCount: number;
	width?: number;
}) {
	return (
		<GraphicContainer width={width}>
			<Header manifest={manifest} />
			<GraphicTeamsList>
				{manifest.topTeams.map((team, i) => (
					<GraphicTeamRow
						key={team.id}
						team={{
							name: team.name,
							logoUrl: montageImageUrl(team.logo),
							players:
								i < rosterCount
									? team.players.map((player) => ({
											name: player.name,
											countryCode: player.countryCode ?? undefined,
										}))
									: [],
							weapons: comps.get(team.id) ?? [],
						}}
						highlighted={team.placement === 1}
						leading={<GraphicPlacementCell placement={team.placement} />}
					/>
				))}
			</GraphicTeamsList>
			<GraphicFooter>
				<div>
					{manifest.teamsCount} teams · {manifest.playersCount} players
				</div>
				<GraphicSiteUrl path={tournamentPage(manifest.tournamentId)} />
			</GraphicFooter>
		</GraphicContainer>
	);
}

function RibbonGraphic({
	vod,
	weaponId,
}: {
	vod: MontageManifestVod;
	weaponId: MainWeaponId | null;
}) {
	return (
		<GraphicContainer width={1400}>
			<div className={styles.ribbon}>
				<div className={styles.ribbonRound}>
					<GraphicBoxLabel>{vod.bracketName ?? "Match"}</GraphicBoxLabel>
					<div className={styles.ribbonRoundName}>
						{vod.roundName ?? `Match ${vod.matchId}`}
					</div>
				</div>
				<div className={styles.ribbonTeams}>
					{vod.teams.map((team, i) => (
						<React.Fragment key={team.id}>
							{i > 0 ? <span className={styles.ribbonVersus}>vs</span> : null}
							<span
								className={
									team.id === vod.team?.id
										? styles.ribbonTeamPov
										: styles.ribbonTeam
								}
							>
								<Avatar
									url={montageImageUrl(team.logo)}
									identiconInput={team.name}
									size="xs"
									loading="eager"
								/>
								<span className={styles.ribbonTeamName}>{team.name}</span>
							</span>
						</React.Fragment>
					))}
				</div>
				<div className={styles.ribbonPov}>
					{vod.pov ? (
						<Avatar
							url={montageImageUrl(vod.pov.avatar)}
							identiconInput={vod.pov.name}
							size="sm"
							loading="eager"
						/>
					) : null}
					<div className={styles.ribbonPovText}>
						<GraphicBoxLabel>{vod.pov ? "POV" : "Cast"}</GraphicBoxLabel>
						<div className={styles.ribbonPovName}>
							{vod.pov?.name ?? `twitch.tv/${vod.account}`}
						</div>
						{vod.pov ? <GraphicSiteUrl path={vod.pov.profilePath} /> : null}
					</div>
					{weaponId === null ? null : (
						<div className={styles.ribbonWeapon}>
							<WeaponImage weaponSplId={weaponId} variant="badge" size={48} />
						</div>
					)}
				</div>
			</div>
		</GraphicContainer>
	);
}

function Header({ manifest }: { manifest: MontageManifest }) {
	return (
		<TournamentGraphicHeader
			tournamentName={manifest.name}
			startTime={new Date(manifest.startsAt)}
			logoUrl={montageImageUrl(manifest.logo)}
			tier={manifest.tier ?? undefined}
			organization={
				manifest.organization
					? {
							name: manifest.organization.name,
							avatarUrl: montageImageUrl(manifest.organization.logo),
						}
					: undefined
			}
		/>
	);
}

/** A 1920×1080 frame at `scale`, the graphic centered on the export's backdrop. */
function Frame({
	scale,
	children,
}: {
	scale: number;
	children: React.ReactNode;
}) {
	return (
		<div
			className={styles.frame}
			style={{ width: 1920 / scale, height: 1080 / scale }}
		>
			{children}
		</div>
	);
}

async function captureImage(
	element: HTMLElement,
	scale: number,
): Promise<Blob> {
	const { snapdom } = await import("@zumer/snapdom");
	await document.fonts.ready;

	// the same options the image export captures with (ImageExportDialog.tsx)
	return snapdom.toBlob(element, {
		type: "png",
		scale,
		dpr: 1,
		embedFonts: true,
		compress: false,
		reconcile: true,
	});
}
