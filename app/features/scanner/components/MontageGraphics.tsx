/**
 * The montage's cards and clip ribbons, built from the image export's
 * graphic blocks (`~/features/img-export`) so the video matches the
 * exported result images. The renderer (and the image downloads) asks for
 * one at a time through `setMontageGraphicCapture`: the stage mounts it off
 * screen in the dark theme, snapdom rasterizes it (the video's at the scale
 * that makes them full-HD sized) and it unmounts again. The page also shows
 * the cards as they are (`MontageCardPreview`) to tweak them by.
 */

import { Link2, User, Users } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { Avatar } from "~/components/Avatar";
import { Flag } from "~/components/Flag";
import { SpecialWeaponImage, WeaponImage } from "~/components/Image";
import { TierPill } from "~/components/TierPill";
import { weaponParams } from "~/features/build-analyzer/core/utils";
import {
	GraphicContainer,
	GraphicDateSubtitle,
	GraphicFooter,
	GraphicHeader,
	GraphicPlacementCell,
	GraphicSiteUrl,
	GraphicTeamRow,
	GraphicTeamsList,
	GraphicTitle,
} from "~/features/img-export/components/Graphic";
import { TournamentGraphicHeader } from "~/features/img-export/components/TournamentResultsGraphic";
import { SNAPDOM_CAPTURE_OPTIONS } from "~/features/img-export/img-export-constants";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { tournamentPage } from "~/utils/urls";
import {
	CARD_WAVE_HEIGHT,
	type CardRevealRect,
	drawCardWave,
	MONTAGE_HEIGHT,
	MONTAGE_WIDTH,
	REVEAL_RISE_PX,
	REVEAL_TIMINGS,
	type RevealStyle,
	RIBBON_GLASS,
	RIBBON_MARGIN_PX,
	revealOrder,
	riseOrder,
} from "../capture/montage-overlays";
import type {
	MontageManifest,
	MontageManifestTopTeam,
	MontageManifestVod,
} from "../core/montage";
import styles from "./MontageGraphics.module.css";
import {
	type MontageGraphic,
	montageImageUrl,
	setMontageGraphicCapture,
} from "./montage";

/** the full-frame graphics' CSS size times this is 1920×1080 */
const FRAME_SCALE: Record<MontageCard["kind"], number> = {
	intro: 2,
	team: 2.2,
};
/** share of the frame's height kept clear under the card for the wave (`drawCardWave`) */
const FRAME_WAVE_CLEARANCE = 0.14;
const RIBBON_SCALE = 1.25;
/** the ribbon preview's frame is 1920×1080 divided by this */
const RIBBON_PREVIEW_SCALE = 2;
/** the image export's own scale (ImageExportDialog.tsx) */
const RESULTS_SCALE = 1.75;
/** the intro's team avatar wall: its content box and the avatar size range */
const TEAM_WALL_WIDTH = 812;
const TEAM_WALL_HEIGHT = 270;
const TEAM_WALL_GAP = 6;
const TEAM_WALL_MAX_AVATAR = 56;
const TEAM_WALL_MIN_AVATAR = 12;

/** a card's revealed items: `hidden` for the renderer to reveal over the capture, `playing` the reveal in the preview */
type RevealState = "shown" | "hidden" | "playing";

/** The full-frame cards of the video. */
export type MontageCard = Extract<MontageGraphic, { kind: "intro" | "team" }>;

interface CaptureRequest {
	graphic: MontageGraphic;
	resolve: (captured: { image: Blob; revealRects: CardRevealRect[] }) => void;
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
		const { graphic } = request;
		const scale =
			graphic.kind === "ribbon"
				? RIBBON_SCALE
				: graphic.kind === "results"
					? RESULTS_SCALE
					: FRAME_SCALE[graphic.kind];
		const rects = revealRects(graphicRef.current);
		captureImage(graphicRef.current, scale)
			.then(
				(image) => request.resolve({ image, revealRects: rects }),
				request.reject,
			)
			// the next request can arrive before this settles: only this one is dropped
			.finally(() =>
				setRequest((current) => (current === request ? null : current)),
			);
	}, [request]);

	if (!request) return null;

	return createPortal(
		<div className={styles.stage} data-theme="dark" aria-hidden>
			<div ref={graphicRef} className={styles.graphic}>
				{request.graphic.kind === "results" ? (
					<ResultsCard manifest={manifest} comps={comps} />
				) : request.graphic.kind === "ribbon" ? (
					<RibbonGraphic
						vod={request.graphic.vod}
						weaponId={request.graphic.weaponId}
					/>
				) : (
					<CardGraphic
						card={request.graphic}
						manifest={manifest}
						comps={comps}
					/>
				)}
			</div>
		</div>,
		document.body,
	);
}

/** The card as the video shows it, at its CSS size with the wave moving, to tweak it by. */
export function MontageCardPreview(props: {
	card: MontageCard;
	manifest: MontageManifest;
	comps: ReadonlyMap<number, MainWeaponId[]>;
}) {
	return (
		<div className={styles.preview} data-theme="dark">
			<CardGraphic {...props} isPreview />
			<CardWave />
		</div>
	);
}

/**
 * The ribbon over a frame of gameplay as the video shows it: the glass is
 * CSS here (`backdrop-filter`), drawn per frame by the renderer
 * (`RIBBON_GLASS`), and the rise and fade loop.
 */
export function MontageRibbonPreview({
	vod,
	weaponId,
	background,
}: {
	vod: MontageManifestVod;
	weaponId: MainWeaponId | null;
	/** a frame of the clip, else a plain backdrop */
	background: string | null;
}) {
	return (
		<div className={styles.preview} data-theme="dark">
			<div
				className={styles.ribbonPreviewFrame}
				style={{
					width: MONTAGE_WIDTH / RIBBON_PREVIEW_SCALE,
					height: MONTAGE_HEIGHT / RIBBON_PREVIEW_SCALE,
					backgroundImage: background ? `url(${background})` : undefined,
				}}
			>
				<div
					className={styles.ribbonPreviewGlass}
					style={{
						zoom: RIBBON_SCALE / RIBBON_PREVIEW_SCALE,
						bottom: RIBBON_MARGIN_PX / RIBBON_SCALE,
						backdropFilter: `blur(${RIBBON_GLASS.blur / RIBBON_SCALE}px)`,
						backgroundColor: RIBBON_GLASS.tint,
						border: `${RIBBON_GLASS.borderWidth / RIBBON_SCALE}px solid ${RIBBON_GLASS.border}`,
						borderRadius: RIBBON_GLASS.radius / RIBBON_SCALE,
					}}
				>
					<RibbonGraphic vod={vod} weaponId={weaponId} />
				</div>
			</div>
		</div>
	);
}

/** The wave as the renderer draws it over the card, played back in real time. */
function CardWave() {
	const canvasRef = React.useRef<HTMLCanvasElement>(null);

	// drawn per animation frame, like the renderer draws it per video frame
	React.useEffect(() => {
		const ctx = canvasRef.current?.getContext("2d");
		if (!ctx) return;
		let frame = 0;
		const startedAt = performance.now();
		const draw = (now: number) => {
			ctx.clearRect(0, 0, MONTAGE_WIDTH, CARD_WAVE_HEIGHT);
			drawCardWave(ctx, (now - startedAt) / 1000, 0);
			frame = requestAnimationFrame(draw);
		};
		frame = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(frame);
	}, []);

	return (
		<canvas
			ref={canvasRef}
			className={styles.previewWave}
			width={MONTAGE_WIDTH}
			height={CARD_WAVE_HEIGHT}
			aria-hidden
		/>
	);
}

function CardGraphic({
	card,
	manifest,
	comps,
	isPreview = false,
}: {
	card: MontageCard;
	manifest: MontageManifest;
	comps: ReadonlyMap<number, MainWeaponId[]>;
	isPreview?: boolean;
}) {
	const team =
		card.kind === "team"
			? manifest.topTeams.find((candidate) => candidate.id === card.teamId)
			: undefined;
	const reveal: RevealState = isPreview
		? "playing"
		: card.hideRevealed
			? "hidden"
			: "shown";

	return (
		<Frame scale={FRAME_SCALE[card.kind]}>
			{team ? (
				<TeamGraphic
					manifest={manifest}
					team={team}
					weapons={comps.get(team.id) ?? []}
					reveal={reveal}
				/>
			) : (
				<IntroGraphic manifest={manifest} reveal={reveal} />
			)}
		</Frame>
	);
}

/** The tournament and every team that played, their avatars popping in. */
function IntroGraphic({
	manifest,
	reveal,
}: {
	manifest: MontageManifest;
	reveal: RevealState;
}) {
	const wall = teamWallLayout(manifest.teams.length);
	const orders = revealOrder(
		"pop",
		manifest.teams.map((_, i) =>
			wallCell(i, wall.perRow, manifest.teams.length),
		),
	);

	return (
		<GraphicContainer width={TEAM_WALL_WIDTH + 48}>
			<GraphicHeader
				leading={
					<Avatar
						url={montageImageUrl(manifest.logo)}
						identiconInput={manifest.name}
						size="md"
						loading="eager"
					/>
				}
				titleRow={
					<GraphicTitle>
						{manifest.name}
						{typeof manifest.tier === "number" ? (
							<span className={styles.introTier}>
								<TierPill tier={manifest.tier} withoutAnimation />
							</span>
						) : null}
					</GraphicTitle>
				}
				subtitle={
					<div className={styles.introSubtitle}>
						<GraphicDateSubtitle date={new Date(manifest.startsAt)} />
						{manifest.organization ? (
							<>
								<span>·</span>
								<Avatar
									url={montageImageUrl(manifest.organization.logo)}
									identiconInput={manifest.organization.name}
									size="xxxsm"
									loading="eager"
								/>
								<span>{manifest.organization.name}</span>
							</>
						) : null}
					</div>
				}
				trailing={
					<>
						<div className={styles.introPill}>
							<span className={styles.introPillItem}>
								<Link2 aria-hidden />
								<GraphicSiteUrl path={tournamentPage(manifest.tournamentId)} />
							</span>
						</div>
						<div className={styles.introPill}>
							<span className={styles.introPillItem}>
								<Users aria-label="Teams" />
								{manifest.teamsCount}
							</span>
							<span className={styles.introPillItem}>
								<User aria-label="Players" />
								{manifest.playersCount}
							</span>
						</div>
					</>
				}
			/>
			<div
				className={styles.teamWall}
				data-reveal-state={reveal}
				style={
					{
						"--team-wall-avatar": `${wall.avatarSize}px`,
						"--team-wall-gap": `${TEAM_WALL_GAP}px`,
						maxHeight: TEAM_WALL_HEIGHT,
					} as React.CSSProperties
				}
			>
				{manifest.teams.map((team, i) => (
					<span
						key={team.id}
						className={styles.teamWallItem}
						data-reveal="pop"
						style={revealItemStyle("pop", orders[i]!, FRAME_SCALE.intro)}
					>
						<Avatar
							url={montageImageUrl(team.logo)}
							identiconInput={team.name}
							size="xs"
							loading="eager"
						/>
					</span>
				))}
			</div>
		</GraphicContainer>
	);
}

/** A top team's introduction: placement, roster and the comp the scans saw. */
function TeamGraphic({
	manifest,
	team,
	weapons,
	reveal,
}: {
	manifest: MontageManifest;
	team: MontageManifestTopTeam;
	weapons: MainWeaponId[];
	/** the roster's, rising in */
	reveal: RevealState;
}) {
	const orders = riseOrder(team.players.length);

	return (
		<GraphicContainer width={720}>
			<GraphicHeader
				leading={
					<div className={styles.teamLeading}>
						<GraphicPlacementCell placement={team.placement} />
						<Avatar
							url={montageImageUrl(team.logo)}
							identiconInput={team.name}
							size="xsm"
							loading="eager"
						/>
					</div>
				}
				titleRow={<GraphicTitle>{team.name}</GraphicTitle>}
				subtitle={<div className={styles.teamSubtitle}>{manifest.name}</div>}
			/>
			<div className={styles.teamSection}>
				<div
					className={styles.teamRoster}
					data-reveal-state={reveal}
					style={{
						gridTemplateColumns: `repeat(${team.players.length > 4 ? 3 : 2}, minmax(0, 1fr))`,
					}}
				>
					{team.players.map((player, i) => (
						<div
							key={player.name}
							className={styles.teamPlayer}
							data-reveal="rise"
							style={revealItemStyle("rise", orders[i]!, FRAME_SCALE.team)}
						>
							<Avatar
								url={montageImageUrl(player.avatar)}
								identiconInput={player.name}
								size="xs"
								loading="eager"
							/>
							<span className={styles.teamPlayerName}>{player.name}</span>
							{player.countryCode ? (
								<Flag countryCode={player.countryCode} tiny />
							) : null}
						</div>
					))}
				</div>
			</div>
			{weapons.length > 0 ? (
				<div className={styles.teamSection}>
					<div className={styles.teamWeapons}>
						{weapons.map((weaponId, i) => (
							<div key={`${weaponId}-${i}`} className={styles.teamWeaponKit}>
								<WeaponImage weaponSplId={weaponId} variant="badge" size={56} />
								<SpecialWeaponImage
									specialWeaponId={
										weaponParams().weaponKits[weaponId].specialWeaponId
									}
									size={32}
								/>
							</div>
						))}
					</div>
				</div>
			) : null}
		</GraphicContainer>
	);
}

/** The results image export's layout: every top team with its roster and comp. */
function ResultsCard({
	manifest,
	comps,
}: {
	manifest: MontageManifest;
	comps: ReadonlyMap<number, MainWeaponId[]>;
}) {
	return (
		<GraphicContainer>
			<Header manifest={manifest} />
			<GraphicTeamsList>
				{manifest.topTeams.map((team) => (
					<GraphicTeamRow
						key={team.id}
						team={{
							name: team.name,
							logoUrl: montageImageUrl(team.logo),
							players: team.players.map((player) => ({
								name: player.name,
								countryCode: player.countryCode ?? undefined,
							})),
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

/**
 * The clip's match, both sides and whose POV it is; transparent, as the
 * renderer puts it on frosted glass (`drawRibbon`).
 */
function RibbonGraphic({
	vod,
	weaponId,
}: {
	vod: MontageManifestVod;
	weaponId: MainWeaponId | null;
}) {
	return (
		<div className={styles.ribbon}>
			<div className={styles.ribbonRound}>
				<div className={styles.ribbonLabel}>{vod.bracketName ?? "Match"}</div>
				<div className={styles.ribbonRoundName}>
					{vod.roundName ?? `Match ${vod.matchId}`}
				</div>
			</div>
			<div className={styles.ribbonTeams}>
				{povTeamFirst(vod).map((team, i) => (
					<React.Fragment key={team.id}>
						{i > 0 ? <span className={styles.ribbonVersus}>vs</span> : null}
						<span className={styles.ribbonTeam}>
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
				<div className={styles.ribbonPovText}>
					<div className={styles.ribbonLabel}>{vod.pov ? "POV" : "Cast"}</div>
					<div className={styles.ribbonPovName}>
						{vod.pov?.name ?? `twitch.tv/${vod.account}`}
					</div>
				</div>
				{vod.pov ? (
					<Avatar
						url={montageImageUrl(vod.pov.avatar)}
						identiconInput={vod.pov.name}
						size="sm"
						loading="eager"
					/>
				) : null}
				{weaponId === null ? null : (
					<div className={styles.ribbonWeapon}>
						<WeaponImage weaponSplId={weaponId} variant="badge" size={54} />
					</div>
				)}
			</div>
		</div>
	);
}

/** The match's sides, the POV team on the left. */
function povTeamFirst(vod: MontageManifestVod) {
	return vod.teams.toSorted(
		(a, b) => Number(b.id === vod.team?.id) - Number(a.id === vod.team?.id),
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

/** A 1920×1080 frame at `scale`, the graphic centered above the band the renderer draws its wave in. */
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
			style={{
				width: 1920 / scale,
				height: 1080 / scale,
				paddingBottom: (1080 / scale) * FRAME_WAVE_CLEARANCE,
			}}
		>
			{children}
		</div>
	);
}

/** The biggest avatar size that fits every team in the wall, and how many go in a row. */
function teamWallLayout(teamCount: number) {
	const perRowFor = (size: number) =>
		Math.floor((TEAM_WALL_WIDTH + TEAM_WALL_GAP) / (size + TEAM_WALL_GAP));
	for (let size = TEAM_WALL_MAX_AVATAR; size > TEAM_WALL_MIN_AVATAR; size--) {
		const perRow = perRowFor(size);
		const rows = Math.ceil(teamCount / perRow);
		if (rows * (size + TEAM_WALL_GAP) - TEAM_WALL_GAP <= TEAM_WALL_HEIGHT) {
			return { avatarSize: size, perRow };
		}
	}
	return {
		avatarSize: TEAM_WALL_MIN_AVATAR,
		perRow: perRowFor(TEAM_WALL_MIN_AVATAR),
	};
}

/** The avatar's cell in the wall, in avatar widths: rows wrap at `perRow`, the last one centered. */
function wallCell(index: number, perRow: number, count: number) {
	const row = Math.floor(index / perRow);
	const inRow = Math.min(perRow, count - row * perRow);
	return {
		x: (perRow - inRow) / 2 + (index % perRow),
		y: row,
		width: 1,
		height: 1,
	};
}

/** The preview's CSS animation timing for the item at `order`, matching the renderer's (`REVEAL_TIMINGS`). */
function revealItemStyle(
	style: RevealStyle,
	order: number,
	scale: number,
): React.CSSProperties {
	const timing = REVEAL_TIMINGS[style];
	return {
		"--reveal-delay": `${timing.start + order * timing.spread}s`,
		"--reveal-duration": `${timing.item}s`,
		"--reveal-rise": `${REVEAL_RISE_PX / scale}px`,
	} as React.CSSProperties;
}

/** Where the graphic's revealed items are, in fractions of its size, in DOM order. */
function revealRects(graphic: HTMLElement): CardRevealRect[] {
	const bounds = graphic.getBoundingClientRect();
	return [...graphic.querySelectorAll("[data-reveal]")].map((item) => {
		const rect = item.getBoundingClientRect();
		return {
			x: (rect.left - bounds.left) / bounds.width,
			y: (rect.top - bounds.top) / bounds.height,
			width: rect.width / bounds.width,
			height: rect.height / bounds.height,
		};
	});
}

async function captureImage(
	element: HTMLElement,
	scale: number,
): Promise<Blob> {
	const { snapdom } = await import("@zumer/snapdom");
	await document.fonts.ready;

	return snapdom.toBlob(element, { ...SNAPDOM_CAPTURE_OPTIONS, scale });
}
