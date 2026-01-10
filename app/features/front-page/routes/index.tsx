import clsx from "clsx";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Image } from "~/components/Image";
import { CalendarIcon } from "~/components/icons/Calendar";
import { Main } from "~/components/Main";
import { useIsMounted } from "~/hooks/useIsMounted";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BUILDS_PAGE,
	mainWeaponImageUrl,
	modeImageUrl,
	stageImageUrl,
} from "~/utils/urls";
import { loader } from "../loaders/index.server";
import styles from "./index.module.css";
export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["front"],
};

const WEAPON_NAMES: Record<number, string> = {
	0: "Sploosh-o-matic",
	10: "Splattershot Jr.",
	20: ".52 Gal",
	30: "N-ZAP '85",
	40: "Splattershot",
	50: "Splattershot Pro",
	60: ".96 Gal",
	70: "Jet Squelcher",
	80: "L-3 Nozzlenose",
	90: "H-3 Nozzlenose",
	100: "Squeezer",
	200: "Luna Blaster",
	210: "Blaster",
	220: "Range Blaster",
	230: "Clash Blaster",
	240: "Rapid Blaster",
	250: "Rapid Blaster Pro",
	260: "S-BLAST '92",
	1000: "Carbon Roller",
	1010: "Splat Roller",
	1020: "Dynamo Roller",
	1030: "Flingza Roller",
	1040: "Big Swig Roller",
	1100: "Inkbrush",
	1110: "Octobrush",
	1120: "Painbrush",
	2000: "Classic Squiffer",
	2010: "Splat Charger",
	2020: "Splatterscope",
	2030: "E-liter 4K",
	2040: "E-liter 4K Scope",
	2050: "Bamboozler 14 Mk I",
	2060: "Goo Tuber",
	2070: "Snipewriter 5H",
	3000: "Slosher",
	3010: "Tri-Slosher",
	3020: "Sloshing Machine",
	3030: "Bloblobber",
	3040: "Explosher",
	3050: "Dread Wringer",
	4000: "Mini Splatling",
	4010: "Heavy Splatling",
	4020: "Hydra Splatling",
	4030: "Ballpoint Splatling",
	4040: "Nautilus 47",
	4050: "Heavy Edit Splatling",
	5000: "Dapple Dualies",
	5010: "Splat Dualies",
	5020: "Glooga Dualies",
	5030: "Dualie Squelchers",
	5040: "Dark Tetra Dualies",
	5050: "Douser Dualies FF",
	6000: "Splat Brella",
	6010: "Tenta Brella",
	6020: "Undercover Brella",
	6030: "Recycled Brella 24 Mk I",
	7010: "Tri-Stringer",
	7020: "REEF-LUX 450",
	7030: "Wellstring V",
	8000: "Splatana Stamper",
	8010: "Splatana Wiper",
	8020: "Mint Decavitator",
};

const STAGE_NAMES: Record<number, string> = {
	0: "Scorch Gorge",
	1: "Eeltail Alley",
	2: "Hagglefish Market",
	3: "Undertow Spillway",
	4: "Mincemeat Metalworks",
	5: "Hammerhead Bridge",
	6: "Museum d'Alfonsino",
	7: "Mahi-Mahi Resort",
	8: "Inkblot Art Academy",
	9: "Sturgeon Shipyard",
	10: "MakoMart",
	11: "Wahoo World",
	12: "Flounder Heights",
	13: "Brinewater Springs",
	14: "Manta Maria",
	15: "Um'ami Ruins",
	16: "Humpback Pump Track",
	17: "Barnacle & Dime",
	18: "Crableg Capital",
	19: "Shipshape Cargo Co.",
	20: "Bluefin Depot",
	21: "Robo ROM-en",
	22: "Marlin Airport",
	23: "Lemuria Hub",
	24: "Urchin Underpass",
};

const MODE_NAMES: Record<string, string> = {
	SZ: "Splat Zones",
	TC: "Tower Control",
	RM: "Rainmaker",
	CB: "Clam Blitz",
};

const MOCK_USERS = [
	{
		id: 1,
		username: "InkMaster",
		avatarUrl: "https://i.pravatar.cc/150?u=user1",
		discordTag: "inkmaster",
	},
	{
		id: 2,
		username: "SplatKing",
		avatarUrl: "https://i.pravatar.cc/150?u=user2",
		discordTag: "splatking",
	},
	{
		id: 3,
		username: "OctoQueen",
		avatarUrl: "https://i.pravatar.cc/150?u=user3",
		discordTag: "octoqueen",
	},
	{
		id: 4,
		username: "TurfPro",
		avatarUrl: "https://i.pravatar.cc/150?u=user4",
		discordTag: "turfpro",
	},
	{
		id: 5,
		username: "ChargerMain",
		avatarUrl: "https://i.pravatar.cc/150?u=user5",
		discordTag: "chargermain",
	},
	{
		id: 6,
		username: "BrushRush",
		avatarUrl: "https://i.pravatar.cc/150?u=user6",
		discordTag: "brushrush",
	},
	{
		id: 7,
		username: "SlosherPro",
		avatarUrl: "https://i.pravatar.cc/150?u=user7",
		discordTag: "slosherpro",
	},
	{
		id: 8,
		username: "DualiesDuo",
		avatarUrl: "https://i.pravatar.cc/150?u=user8",
		discordTag: "dualiesduo",
	},
	{
		id: 9,
		username: "BrellaShield",
		avatarUrl: "https://i.pravatar.cc/150?u=user9",
		discordTag: "brellashield",
	},
	{
		id: 10,
		username: "StringerAce",
		avatarUrl: "https://i.pravatar.cc/150?u=user10",
		discordTag: "stringerace",
	},
	{
		id: 11,
		username: "SplatanaSlash",
		avatarUrl: "https://i.pravatar.cc/150?u=user11",
		discordTag: "splatanaslash",
	},
	{
		id: 12,
		username: "RollerCrush",
		avatarUrl: "https://i.pravatar.cc/150?u=user12",
		discordTag: "rollercrush",
	},
	{
		id: 13,
		username: "BlasterBoom",
		avatarUrl: "https://i.pravatar.cc/150?u=user13",
		discordTag: "blasterboom",
	},
	{
		id: 14,
		username: "SplatlingSpray",
		avatarUrl: "https://i.pravatar.cc/150?u=user14",
		discordTag: "splatlingspray",
	},
	{
		id: 15,
		username: "SquifferQuick",
		avatarUrl: "https://i.pravatar.cc/150?u=user15",
		discordTag: "squifferquick",
	},
	{
		id: 16,
		username: "NautFlex",
		avatarUrl: "https://i.pravatar.cc/150?u=user16",
		discordTag: "nautflex",
	},
	{
		id: 17,
		username: "TetraTop",
		avatarUrl: "https://i.pravatar.cc/150?u=user17",
		discordTag: "tetratop",
	},
	{
		id: 18,
		username: "ReefLuxer",
		avatarUrl: "https://i.pravatar.cc/150?u=user18",
		discordTag: "reefluxer",
	},
	{
		id: 19,
		username: "GooTubeGuru",
		avatarUrl: "https://i.pravatar.cc/150?u=user19",
		discordTag: "gootubeguru",
	},
	{
		id: 20,
		username: "BamboozleKing",
		avatarUrl: "https://i.pravatar.cc/150?u=user20",
		discordTag: "bamboozleking",
	},
];

type FeedPostType =
	| "art_posted"
	| "sendouq_match"
	| "tournament_placement"
	| "build_shared"
	| "team_formed"
	| "leaderboard_climb"
	| "vod_review"
	| "lfg_post"
	| "tournament_signup"
	| "replay_shared";

interface FeedPost {
	id: number;
	type: FeedPostType;
	user: (typeof MOCK_USERS)[0];
	timestamp: Date;
	content: FeedPostContent;
}

interface SendouQMatchContent {
	type: "sendouq_match";
	result: "win" | "loss";
	score: [number, number];
	powerChange: number;
	newPower: number;
	stage: number;
	mode: string;
	weapon: number;
	teammates: Array<{ username: string; avatarUrl: string; weapon: number }>;
	opponents: Array<{ username: string; avatarUrl: string; weapon: number }>;
}

interface TournamentPlacementContent {
	type: "tournament_placement";
	tournamentName: string;
	placement: number;
	teamName: string;
	teammates: Array<{ username: string; avatarUrl: string }>;
}

interface BuildSharedContent {
	type: "build_shared";
	weapon: number;
	description: string;
	abilities: string[];
}

interface TeamFormedContent {
	type: "team_formed";
	teamName: string;
	members: Array<{ username: string; avatarUrl: string; role: string }>;
}

interface LeaderboardClimbContent {
	type: "leaderboard_climb";
	previousRank: number;
	newRank: number;
	power: number;
	season: number;
}

interface VodReviewContent {
	type: "vod_review";
	tournamentName: string;
	matchDescription: string;
	weapon: number;
}

interface LfgPostContent {
	type: "lfg_post";
	lookingFor: string;
	weapons: number[];
	availability: string;
}

interface TournamentSignupContent {
	type: "tournament_signup";
	tournamentName: string;
	teamName: string;
	startTime: string;
}

interface ArtPostedContent {
	type: "art_posted";
	description: string;
	images: string[];
}

interface ReplaySharedContent {
	type: "replay_shared";
	replayCode: string;
	weapon: number;
	stage: number;
	mode: string;
}

type FeedPostContent =
	| ArtPostedContent
	| SendouQMatchContent
	| TournamentPlacementContent
	| BuildSharedContent
	| TeamFormedContent
	| LeaderboardClimbContent
	| VodReviewContent
	| LfgPostContent
	| TournamentSignupContent
	| ReplaySharedContent;

function generateMockPosts(): FeedPost[] {
	const posts: FeedPost[] = [];

	posts.push({
		id: -1,
		type: "replay_shared",
		user: MOCK_USERS[0],
		timestamp: new Date(Date.now() - 1 * 60 * 1000),
		content: {
			type: "replay_shared",
			replayCode: "RT7V-Y5JL-JXGV-HHT1",
			weapon: 50,
			stage: 8,
			mode: "SZ",
		},
	});

	posts.push({
		id: 0,
		type: "art_posted",
		user: MOCK_USERS[3],
		timestamp: new Date(Date.now() - 2 * 60 * 1000),
		content: {
			type: "art_posted",
			description: "Posted new art",
			images: [
				"https://picsum.photos/seed/art1/200/200",
				"https://picsum.photos/seed/art2/200/200",
				"https://picsum.photos/seed/art3/200/200",
			],
		},
	});

	posts.push({
		id: 1,
		type: "sendouq_match",
		user: MOCK_USERS[0],
		timestamp: new Date(Date.now() - 5 * 60 * 1000),
		content: {
			type: "sendouq_match",
			result: "win",
			score: [3, 1],
			powerChange: 12.5,
			newPower: 2156.8,
			stage: 8,
			mode: "SZ",
			weapon: 50,
			teammates: [
				{
					username: MOCK_USERS[1].username,
					avatarUrl: MOCK_USERS[1].avatarUrl,
					weapon: 2010,
				},
				{
					username: MOCK_USERS[2].username,
					avatarUrl: MOCK_USERS[2].avatarUrl,
					weapon: 1010,
				},
				{
					username: MOCK_USERS[3].username,
					avatarUrl: MOCK_USERS[3].avatarUrl,
					weapon: 5010,
				},
			],
			opponents: [
				{
					username: MOCK_USERS[4].username,
					avatarUrl: MOCK_USERS[4].avatarUrl,
					weapon: 40,
				},
				{
					username: MOCK_USERS[5].username,
					avatarUrl: MOCK_USERS[5].avatarUrl,
					weapon: 7010,
				},
				{
					username: MOCK_USERS[6].username,
					avatarUrl: MOCK_USERS[6].avatarUrl,
					weapon: 210,
				},
				{
					username: MOCK_USERS[7].username,
					avatarUrl: MOCK_USERS[7].avatarUrl,
					weapon: 4010,
				},
			],
		},
	});

	posts.push({
		id: 2,
		type: "tournament_placement",
		user: MOCK_USERS[8],
		timestamp: new Date(Date.now() - 45 * 60 * 1000),
		content: {
			type: "tournament_placement",
			tournamentName: "Paddling Pool 252",
			placement: 1,
			teamName: "FTWin",
			teammates: [
				{
					username: MOCK_USERS[9].username,
					avatarUrl: MOCK_USERS[9].avatarUrl,
				},
				{
					username: MOCK_USERS[10].username,
					avatarUrl: MOCK_USERS[10].avatarUrl,
				},
				{
					username: MOCK_USERS[11].username,
					avatarUrl: MOCK_USERS[11].avatarUrl,
				},
			],
		},
	});

	posts.push({
		id: 3,
		type: "build_shared",
		user: MOCK_USERS[12],
		timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
		content: {
			type: "build_shared",
			weapon: 2010,
			description:
				"My go-to charger build for ranked. Great for holding zones on most maps.",
			abilities: [
				"Thermal Ink",
				"Swim Speed Up",
				"Ink Resistance Up",
				"Quick Super Jump",
			],
		},
	});

	posts.push({
		id: 4,
		type: "team_formed",
		user: MOCK_USERS[13],
		timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
		content: {
			type: "team_formed",
			teamName: "Undersea Dreamers",
			members: [
				{
					username: MOCK_USERS[13].username,
					avatarUrl: MOCK_USERS[13].avatarUrl,
					role: "Slayer",
				},
				{
					username: MOCK_USERS[14].username,
					avatarUrl: MOCK_USERS[14].avatarUrl,
					role: "Anchor",
				},
				{
					username: MOCK_USERS[15].username,
					avatarUrl: MOCK_USERS[15].avatarUrl,
					role: "Support",
				},
				{
					username: MOCK_USERS[16].username,
					avatarUrl: MOCK_USERS[16].avatarUrl,
					role: "Flex",
				},
			],
		},
	});

	posts.push({
		id: 5,
		type: "leaderboard_climb",
		user: MOCK_USERS[17],
		timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
		content: {
			type: "leaderboard_climb",
			previousRank: 47,
			newRank: 12,
			power: 2489.3,
			season: 14,
		},
	});

	posts.push({
		id: 6,
		type: "sendouq_match",
		user: MOCK_USERS[4],
		timestamp: new Date(Date.now() - 15 * 60 * 1000),
		content: {
			type: "sendouq_match",
			result: "loss",
			score: [2, 3],
			powerChange: -8.2,
			newPower: 1987.4,
			stage: 14,
			mode: "TC",
			weapon: 1010,
			teammates: [
				{
					username: MOCK_USERS[5].username,
					avatarUrl: MOCK_USERS[5].avatarUrl,
					weapon: 40,
				},
				{
					username: MOCK_USERS[6].username,
					avatarUrl: MOCK_USERS[6].avatarUrl,
					weapon: 3010,
				},
				{
					username: MOCK_USERS[7].username,
					avatarUrl: MOCK_USERS[7].avatarUrl,
					weapon: 2010,
				},
			],
			opponents: [
				{
					username: MOCK_USERS[0].username,
					avatarUrl: MOCK_USERS[0].avatarUrl,
					weapon: 7010,
				},
				{
					username: MOCK_USERS[1].username,
					avatarUrl: MOCK_USERS[1].avatarUrl,
					weapon: 8000,
				},
				{
					username: MOCK_USERS[2].username,
					avatarUrl: MOCK_USERS[2].avatarUrl,
					weapon: 5010,
				},
				{
					username: MOCK_USERS[3].username,
					avatarUrl: MOCK_USERS[3].avatarUrl,
					weapon: 210,
				},
			],
		},
	});

	posts.push({
		id: 7,
		type: "lfg_post",
		user: MOCK_USERS[18],
		timestamp: new Date(Date.now() - 30 * 60 * 1000),
		content: {
			type: "lfg_post",
			lookingFor: "Looking for a team for LUTI Season 12! Div 4-5 experience.",
			weapons: [50, 60, 40],
			availability: "Weekday evenings EST",
		},
	});

	posts.push({
		id: 8,
		type: "tournament_signup",
		user: MOCK_USERS[19],
		timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000),
		content: {
			type: "tournament_signup",
			tournamentName: "In The Zone 148",
			teamName: "Starburst",
			startTime: "Tomorrow, 7:00 PM EST",
		},
	});

	posts.push({
		id: 9,
		type: "vod_review",
		user: MOCK_USERS[2],
		timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
		content: {
			type: "vod_review",
			tournamentName: "Low Ink February Finals",
			matchDescription: "Grand Finals vs Jackpot - Game 5 Rainmaker",
			weapon: 8000,
		},
	});

	posts.push({
		id: 10,
		type: "tournament_placement",
		user: MOCK_USERS[5],
		timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
		content: {
			type: "tournament_placement",
			tournamentName: "Swim or Sink 88",
			placement: 3,
			teamName: "Komorebi",
			teammates: [
				{
					username: MOCK_USERS[6].username,
					avatarUrl: MOCK_USERS[6].avatarUrl,
				},
				{
					username: MOCK_USERS[7].username,
					avatarUrl: MOCK_USERS[7].avatarUrl,
				},
				{
					username: MOCK_USERS[8].username,
					avatarUrl: MOCK_USERS[8].avatarUrl,
				},
			],
		},
	});

	return posts;
}

const MOCK_POSTS = generateMockPosts();

export default function FrontPage() {
	return (
		<Main className={styles.frontPageContainer}>
			<SocialFeed posts={MOCK_POSTS} />
		</Main>
	);
}

function SocialFeed({ posts }: { posts: FeedPost[] }) {
	return (
		<div className={styles.socialFeed}>
			<div className={styles.feedHeader}>
				<h1 className={styles.feedTitle}>Activity Feed</h1>
				<div className={styles.feedFilters}>
					<button
						type="button"
						className={clsx(styles.filterBtn, styles.filterBtnActive)}
					>
						All
					</button>
					<button type="button" className={styles.filterBtn}>
						SendouQ
					</button>
					<button type="button" className={styles.filterBtn}>
						Tournaments
					</button>
					<button type="button" className={styles.filterBtn}>
						Teams
					</button>
				</div>
			</div>
			<div className={styles.feedPosts}>
				{posts.map((post) => (
					<FeedPostCard key={post.id} post={post} />
				))}
			</div>
		</div>
	);
}

function FeedPostCard({ post }: { post: FeedPost }) {
	const isMounted = useIsMounted();
	const timeAgo = isMounted ? formatTimeAgo(post.timestamp) : "";

	return (
		<article className={styles.feedPost}>
			<div className={styles.postHeader}>
				<Avatar url={post.user.avatarUrl} size="sm" />
				<div className={styles.postHeaderInfo}>
					<span className={styles.postUsername}>{post.user.username}</span>
					<span className={styles.postTime}>{timeAgo}</span>
				</div>
				<PostTypeBadge type={post.type} />
			</div>
			<div className={styles.postContent}>
				<PostContent content={post.content} />
			</div>
		</article>
	);
}

function PostTypeBadge({ type }: { type: FeedPostType }) {
	const badges: Record<FeedPostType, { label: string; className: string }> = {
		art_posted: { label: "Art", className: styles.badgeArt },
		sendouq_match: { label: "SendouQ", className: styles.badgeSendouq },
		tournament_placement: {
			label: "Tournament",
			className: styles.badgeTournament,
		},
		build_shared: { label: "Build", className: styles.badgeBuild },
		team_formed: { label: "Team", className: styles.badgeTeam },
		leaderboard_climb: {
			label: "Leaderboard",
			className: styles.badgeLeaderboard,
		},
		vod_review: { label: "VOD", className: styles.badgeVod },
		lfg_post: { label: "LFG", className: styles.badgeLfg },
		tournament_signup: { label: "Signup", className: styles.badgeSignup },
		replay_shared: { label: "Replay", className: styles.badgeReplay },
	};

	const badge = badges[type];
	return (
		<span className={clsx(styles.postBadge, badge.className)}>
			{badge.label}
		</span>
	);
}

function PostContent({ content }: { content: FeedPostContent }) {
	switch (content.type) {
		case "art_posted":
			return <ArtPostedPost content={content} />;
		case "sendouq_match":
			return <SendouQMatchPost content={content} />;
		case "tournament_placement":
			return <TournamentPlacementPost content={content} />;
		case "build_shared":
			return <BuildSharedPost content={content} />;
		case "team_formed":
			return <TeamFormedPost content={content} />;
		case "leaderboard_climb":
			return <LeaderboardClimbPost content={content} />;
		case "vod_review":
			return <VodReviewPost content={content} />;
		case "lfg_post":
			return <LfgPost content={content} />;
		case "tournament_signup":
			return <TournamentSignupPost content={content} />;
		case "replay_shared":
			return <ReplaySharedPost content={content} />;
		default:
			return null;
	}
}

function ArtPostedPost({ content }: { content: ArtPostedContent }) {
	return (
		<div className={styles.artPosted}>
			<p className={styles.artDescription}>{content.description}</p>
			<div className={styles.artImages}>
				{content.images.map((imageUrl, i) => (
					<img key={i} src={imageUrl} alt="" className={styles.artImage} />
				))}
			</div>
		</div>
	);
}

function ReplaySharedPost({ content }: { content: ReplaySharedContent }) {
	return (
		<div className={styles.replayShared}>
			<div className={styles.replayCode}>
				<span className={styles.replayCodeLabel}>Replay Code</span>
				<span className={styles.replayCodeValue}>{content.replayCode}</span>
			</div>
			<div className={styles.replayDetails}>
				<div className={styles.replayMapMode}>
					<Image
						path={stageImageUrl(content.stage as any)}
						alt=""
						className={styles.replayStageImg}
					/>
					<div className={styles.replayMapInfo}>
						<span className={styles.replayStageName}>
							{STAGE_NAMES[content.stage]}
						</span>
						<div className={styles.replayModeRow}>
							<Image
								path={modeImageUrl(content.mode as any)}
								alt=""
								width={16}
							/>
							<span>{MODE_NAMES[content.mode]}</span>
						</div>
					</div>
				</div>
				<div className={styles.replayWeapon}>
					<Image
						path={mainWeaponImageUrl(content.weapon as any)}
						alt=""
						width={40}
					/>
					<span className={styles.replayWeaponName}>
						{WEAPON_NAMES[content.weapon]}
					</span>
				</div>
			</div>
		</div>
	);
}

function SendouQMatchPost({ content }: { content: SendouQMatchContent }) {
	const isWin = content.result === "win";

	return (
		<div className={styles.sendouqMatch}>
			<div
				className={clsx(
					styles.matchResult,
					isWin ? styles.matchWin : styles.matchLoss,
				)}
			>
				<span className={styles.matchResultText}>
					{isWin ? "Victory" : "Defeat"}
				</span>
				<span className={styles.matchScore}>
					{content.score[0]} - {content.score[1]}
				</span>
			</div>

			<div className={styles.matchDetails}>
				<div className={styles.matchMapMode}>
					<Image
						path={stageImageUrl(content.stage as any)}
						alt=""
						className={styles.matchStageImg}
					/>
					<div className={styles.matchMapInfo}>
						<span className={styles.matchStageName}>
							{STAGE_NAMES[content.stage]}
						</span>
						<div className={styles.matchModeRow}>
							<Image
								path={modeImageUrl(content.mode as any)}
								alt=""
								width={16}
							/>
							<span>{MODE_NAMES[content.mode]}</span>
						</div>
					</div>
				</div>

				<div className={styles.matchPower}>
					<span
						className={clsx(
							styles.powerChange,
							isWin ? styles.powerUp : styles.powerDown,
						)}
					>
						{isWin ? "+" : ""}
						{content.powerChange.toFixed(1)}
					</span>
					<span className={styles.newPower}>
						{content.newPower.toFixed(1)} SP
					</span>
				</div>
			</div>

			<div className={styles.matchTeams}>
				<div className={styles.matchTeam}>
					<span className={styles.teamLabel}>Your Team</span>
					<div className={styles.teamPlayers}>
						<Image
							path={mainWeaponImageUrl(content.weapon as any)}
							alt=""
							width={24}
							title="You"
						/>
						{content.teammates.map((tm, i) => (
							<Image
								key={i}
								path={mainWeaponImageUrl(tm.weapon as any)}
								alt=""
								width={24}
								title={tm.username}
							/>
						))}
					</div>
				</div>
				<div className={styles.matchTeam}>
					<span className={styles.teamLabel}>Opponents</span>
					<div className={styles.teamPlayers}>
						{content.opponents.map((op, i) => (
							<Image
								key={i}
								path={mainWeaponImageUrl(op.weapon as any)}
								alt=""
								width={24}
								title={op.username}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function TournamentPlacementPost({
	content,
}: {
	content: TournamentPlacementContent;
}) {
	const placementEmoji =
		content.placement === 1
			? "🥇"
			: content.placement === 2
				? "🥈"
				: content.placement === 3
					? "🥉"
					: "";
	const placementText =
		content.placement === 1
			? "1st"
			: content.placement === 2
				? "2nd"
				: content.placement === 3
					? "3rd"
					: `${content.placement}th`;

	return (
		<div className={styles.tournamentPlacement}>
			<div className={styles.placementHeader}>
				<span className={styles.placementEmoji}>{placementEmoji}</span>
				<div className={styles.placementInfo}>
					<span className={styles.placementText}>{placementText} Place</span>
					<span className={styles.tournamentName}>
						{content.tournamentName}
					</span>
				</div>
			</div>
			<div className={styles.placementTeam}>
				<span className={styles.teamName}>{content.teamName}</span>
				<div className={styles.placementTeammates}>
					{content.teammates.map((tm, i) => (
						<Avatar key={i} url={tm.avatarUrl} size="xxs" alt={tm.username} />
					))}
				</div>
			</div>
		</div>
	);
}

function BuildSharedPost({ content }: { content: BuildSharedContent }) {
	return (
		<div className={styles.buildShared}>
			<div className={styles.buildWeapon}>
				<Image
					path={mainWeaponImageUrl(content.weapon as any)}
					alt=""
					width={48}
				/>
				<span className={styles.weaponName}>
					{WEAPON_NAMES[content.weapon] ?? "Unknown Weapon"}
				</span>
			</div>
			<p className={styles.buildDescription}>{content.description}</p>
			<div className={styles.buildAbilities}>
				{content.abilities.map((ability, i) => (
					<span key={i} className={styles.abilityTag}>
						{ability}
					</span>
				))}
			</div>
			<Link to={BUILDS_PAGE} className={styles.viewBuildLink}>
				View full build →
			</Link>
		</div>
	);
}

function TeamFormedPost({ content }: { content: TeamFormedContent }) {
	return (
		<div className={styles.teamFormed}>
			<div className={styles.teamHeader}>
				<span className={styles.teamFormedName}>{content.teamName}</span>
				<span className={styles.teamFormedLabel}>New Team</span>
			</div>
			<div className={styles.teamMembers}>
				{content.members.map((member, i) => (
					<div key={i} className={styles.teamMember}>
						<Avatar url={member.avatarUrl} size="xs" />
						<div className={styles.memberInfo}>
							<span className={styles.memberName}>{member.username}</span>
							<span className={styles.memberRole}>{member.role}</span>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function LeaderboardClimbPost({
	content,
}: {
	content: LeaderboardClimbContent;
}) {
	const rankDiff = content.previousRank - content.newRank;

	return (
		<div className={styles.leaderboardClimb}>
			<div className={styles.climbStats}>
				<div className={styles.rankChange}>
					<span className={styles.rankLabel}>Rank</span>
					<div className={styles.rankNumbers}>
						<span className={styles.oldRank}>#{content.previousRank}</span>
						<span className={styles.rankArrow}>→</span>
						<span className={styles.newRank}>#{content.newRank}</span>
					</div>
					<span className={styles.rankDiff}>+{rankDiff} positions</span>
				</div>
				<div className={styles.powerStat}>
					<span className={styles.powerLabel}>Power</span>
					<span className={styles.powerValue}>{content.power.toFixed(1)}</span>
				</div>
			</div>
			<div className={styles.seasonInfo}>
				Season {content.season} Leaderboard
			</div>
		</div>
	);
}

function VodReviewPost({ content }: { content: VodReviewContent }) {
	return (
		<div className={styles.vodReview}>
			<div className={styles.vodHeader}>
				<Image
					path={mainWeaponImageUrl(content.weapon as any)}
					alt=""
					width={32}
				/>
				<div className={styles.vodInfo}>
					<span className={styles.vodTournament}>{content.tournamentName}</span>
					<span className={styles.vodMatch}>{content.matchDescription}</span>
				</div>
			</div>
			<button type="button" className={styles.watchVodBtn}>
				Watch VOD
			</button>
		</div>
	);
}

function LfgPost({ content }: { content: LfgPostContent }) {
	return (
		<div className={styles.lfgPost}>
			<p className={styles.lfgText}>{content.lookingFor}</p>
			<div className={styles.lfgWeapons}>
				{content.weapons.map((weapon, i) => (
					<Image
						key={i}
						path={mainWeaponImageUrl(weapon as any)}
						alt=""
						width={28}
					/>
				))}
			</div>
			<div className={styles.lfgAvailability}>
				<span className={styles.availLabel}>Available:</span>
				<span>{content.availability}</span>
			</div>
		</div>
	);
}

function TournamentSignupPost({
	content,
}: {
	content: TournamentSignupContent;
}) {
	return (
		<div className={styles.tournamentSignup}>
			<div className={styles.signupInfo}>
				<span className={styles.signupTeam}>{content.teamName}</span>
				<span className={styles.signupAction}>signed up for</span>
				<span className={styles.signupTournament}>
					{content.tournamentName}
				</span>
			</div>
			<div className={styles.signupTime}>
				<CalendarIcon />
				<span>{content.startTime}</span>
			</div>
		</div>
	);
}

function formatTimeAgo(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMins / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	return `${diffDays}d ago`;
}

/* =========================================
   COMMENTED OUT ORIGINAL COMPONENTS
   =========================================

import { Divider } from "~/components/Divider";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { ArrowRightIcon } from "~/components/icons/ArrowRight";
import { BSKYLikeIcon } from "~/components/icons/BSKYLike";
import { BSKYReplyIcon } from "~/components/icons/BSKYReply";
import { BSKYRepostIcon } from "~/components/icons/BSKYRepost";
import { ExternalIcon } from "~/components/icons/External";
import { KeyIcon } from "~/components/icons/Key";
import { SearchIcon } from "~/components/icons/Search";
import type { ShowcaseCalendarEvent } from "~/features/calendar/calendar-types";
import { TournamentCard } from "~/features/calendar/components/TournamentCard";
import type * as Changelog from "~/features/front-page/core/Changelog.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { useIsMounted } from "~/hooks/useIsMounted";
import {
	BLANK_IMAGE_URL,
	CALENDAR_TOURNAMENTS_PAGE,
	LUTI_PAGE,
	leaderboardsPage,
	SENDOUQ_PAGE,
	sqHeaderGuyImageUrl,
} from "~/utils/urls";

function SeasonBanner() {
	const { t } = useTranslation(["front"]);
	const season = Seasons.next(new Date()) ?? Seasons.currentOrPrevious()!;
	const _previousSeason = Seasons.previous();
	const isMounted = useIsMounted();
	const { formatDate } = useTimeFormat();

	const isInFuture = new Date() < season.starts;
	const isShowingPreviousSeason = _previousSeason?.nth === season.nth;

	if (isShowingPreviousSeason) return null;

	return (
		<div className="stack sm">
			<Link to={SENDOUQ_PAGE} className={styles.seasonBanner}>
				<div className={styles.seasonBannerHeader}>
					{t("front:sq.season", { nth: season.nth })}
				</div>
				{isMounted ? (
					<div className={styles.seasonBannerDates}>
						{formatDate(season.starts, {
							month: "long",
							day: "numeric",
						})}{" "}
						-{" "}
						{formatDate(season.ends, {
							month: "long",
							day: "numeric",
						})}
					</div>
				) : (
					<div className={clsx(styles.seasonBannerDates, "invisible")}>X</div>
				)}
				<Image
					className={styles.seasonBannerImg}
					path={sqHeaderGuyImageUrl(season.nth)}
					alt=""
				/>
			</Link>
			<Link to={SENDOUQ_PAGE} className={styles.seasonBannerLink}>
				<div className="stack horizontal xs items-center">
					<Image path={navIconUrl("sendouq")} width={24} alt="" />
					{isInFuture ? t("front:sq.prepare") : t("front:sq.participate")}
					<ArrowRightIcon />
				</div>
			</Link>
		</div>
	);
}

function LeagueBanner() {
	const showBannerFor = import.meta.env.VITE_SHOW_BANNER_FOR_SEASON;
	if (!showBannerFor) return null;

	return (
		<Link to={LUTI_PAGE} className={styles.lutiBanner}>
			<Image path={navIconUrl("luti")} size={24} alt="" />
			Registration now open for Leagues Under The Ink (LUTI) Season{" "}
			{showBannerFor}!
		</Link>
	);
}

function TournamentCards() {
	const { t } = useTranslation(["front"]);
	const data = useLoaderData<typeof loader>();

	if (
		data.tournaments.participatingFor.length === 0 &&
		data.tournaments.organizingFor.length === 0 &&
		data.tournaments.showcase.length === 0
	) {
		return null;
	}

	const showSignedUpTab = data.tournaments.participatingFor.length > 0;
	const showOrganizerTab = data.tournaments.organizingFor.length > 0;
	const showDiscoverTab = data.tournaments.showcase.length > 0;

	return (
		<div>
			<SendouTabs padded={false}>
				<SendouTabList>
					{showSignedUpTab ? (
						<SendouTab id="signed-up" icon={<UsersIcon />}>
							{t("front:showcase.tabs.signedUp")}
						</SendouTab>
					) : null}
					{showOrganizerTab ? (
						<SendouTab id="organizer" icon={<KeyIcon />}>
							{t("front:showcase.tabs.organizer")}
						</SendouTab>
					) : null}
					{showDiscoverTab ? (
						<SendouTab id="discover" icon={<SearchIcon />}>
							{t("front:showcase.tabs.discover")}
						</SendouTab>
					) : null}
				</SendouTabList>
				<SendouTabPanel id="signed-up">
					<ShowcaseTournamentScroller
						tournaments={data.tournaments.participatingFor}
					/>
				</SendouTabPanel>
				<SendouTabPanel id="organizer">
					<ShowcaseTournamentScroller
						tournaments={data.tournaments.organizingFor}
					/>
				</SendouTabPanel>
				<SendouTabPanel id="discover">
					<ShowcaseTournamentScroller tournaments={data.tournaments.showcase} />
				</SendouTabPanel>
			</SendouTabs>
		</div>
	);
}

function ShowcaseTournamentScroller({
	tournaments,
}: {
	tournaments: ShowcaseCalendarEvent[];
}) {
	return (
		<div className={styles.tournamentCards}>
			<div
				className={clsx(
					styles.tournamentCardsSpacer,
					"overflow-x-auto scrollbar",
				)}
			>
				{tournaments.map((tournament) => (
					<TournamentCard
						key={tournament.id}
						tournament={tournament}
						className="mt-4"
					/>
				))}
			</div>
			<AllTournamentsLinkCard />
		</div>
	);
}

function AllTournamentsLinkCard() {
	const { t } = useTranslation(["front"]);

	return (
		<Link
			to={CALENDAR_TOURNAMENTS_PAGE}
			className={clsx(styles.tournamentCardsViewAllCard)}
		>
			<Image path={navIconUrl("medal")} size={36} alt="" />
			{t("front:showcase.viewAll")}
		</Link>
	);
}

function ResultHighlights() {
	const { t } = useTranslation(["front"]);
	const data = useLoaderData<typeof loader>();

	// should not happen
	if (
		!data.leaderboards.team.length ||
		!data.leaderboards.user.length ||
		!data.tournaments.results.length
	) {
		return null;
	}

	const season = Seasons.currentOrPrevious()!;

	const recentResults = (
		<>
			<h2
				className={clsx(
					styles.resultHighlightsTitle,
					styles.resultHighlightsTitleTournaments,
				)}
			>
				{t("front:showcase.results")}
			</h2>
			<div className={styles.tournamentCardsSpacer}>
				{data.tournaments.results.map((tournament) => (
					<TournamentCard
						key={tournament.id}
						tournament={tournament}
						withRelativeTime
					/>
				))}
			</div>
		</>
	);

	return (
		<>
			<div
				className={clsx(styles.resultHighlights, "overflow-x-auto scrollbar")}
			>
				<div className="stack sm text-center">
					<h2 className={styles.resultHighlightsTitle}>
						{t("front:leaderboards.topPlayers")}
					</h2>
					<Leaderboard
						entries={data.leaderboards.user}
						fullLeaderboardUrl={leaderboardsPage({
							season: season.nth,
							type: "USER",
						})}
					/>
				</div>
				<div className="stack sm text-center">
					<h2 className={styles.resultHighlightsTitle}>
						{t("front:leaderboards.topTeams")}
					</h2>
					<Leaderboard
						entries={data.leaderboards.team}
						fullLeaderboardUrl={leaderboardsPage({
							season: season.nth,
							type: "TEAM",
						})}
					/>
				</div>
				<div className="stack sm text-center mobile-hidden">
					{recentResults}
				</div>
			</div>
			<div
				className={clsx(styles.resultHighlights, "overflow-x-auto scrollbar")}
			>
				<div className="stack sm text-center desktop-hidden">
					{recentResults}
				</div>
			</div>
		</>
	);
}

function Leaderboard({
	entries,
	fullLeaderboardUrl,
}: {
	entries: LeaderboardEntry[];
	fullLeaderboardUrl: string;
}) {
	const { t } = useTranslation(["front"]);

	return (
		<div className="stack xs items-center">
			<div className={styles.leaderboard}>
				{entries.map((entry, index) => (
					<Link
						to={entry.url}
						key={entry.url}
						className="stack sm horizontal items-center text-main-forced"
					>
						<div className="mx-1">{index + 1}</div>
						<Avatar url={entry.avatarUrl ?? BLANK_IMAGE_URL} size="xs" />
						<div className="stack items-start">
							<div className={styles.leaderboardName}>{entry.name}</div>
							<div className="text-xs font-semi-bold text-lighter">
								{entry.power.toFixed(2)}
							</div>
						</div>
					</Link>
				))}
			</div>
			<Link to={fullLeaderboardUrl} className={styles.leaderboardViewAll}>
				<Image path={navIconUrl("leaderboards")} size={16} alt="" />
				{t("front:leaderboards.viewFull")}
			</Link>
		</div>
	);
}

function ChangelogList() {
	const { t } = useTranslation(["front"]);
	const data = useLoaderData<typeof loader>();

	if (data.changelog.length === 0) return null;

	return (
		<div className="stack md">
			<Divider smallText className="text-uppercase text-xs font-bold">
				{t("front:updates.header")}
			</Divider>
			{data.changelog.map((item) => (
				<React.Fragment key={item.id}>
					<ChangelogItem item={item} />
					<br />
				</React.Fragment>
			))}
			<a
				href="https://bsky.app/hashtag/sendouink?author=sendou.ink"
				target="_blank"
				rel="noopener noreferrer"
				className="stack horizontal sm mx-auto text-xs font-bold"
			>
				{t("front:updates.viewPast")}{" "}
				<ExternalIcon className={styles.externalLinkIcon} />
			</a>
		</div>
	);
}

const ADMIN_PFP_URL =
	"https://cdn.discordapp.com/avatars/79237403620945920/6fc41a44b069a0d2152ac06d1e496c6c.webp?size=80";

function ChangelogItem({ item }: { item: Changelog.ChangelogItem }) {
	return (
		<div className="stack sm horizontal">
			<Avatar size="sm" url={ADMIN_PFP_URL} />
			<div className="whitespace-pre-wrap">
				<div className="font-bold">
					Sendou{" "}
					<span className="text-xs text-lighter">{item.createdAtRelative}</span>
				</div>
				{item.text}
				{item.images.length > 0 ? (
					<div className="mt-4 stack horizontal sm flex-wrap">
						{item.images.map((image) => (
							<img
								key={image.thumb}
								src={image.thumb}
								alt=""
								className={styles.changeLogImg}
							/>
						))}
					</div>
				) : null}
				<div className="mt-4 stack xxl horizontal">
					<BSKYIconLink count={item.stats.replies} postUrl={item.postUrl}>
						<BSKYReplyIcon />
					</BSKYIconLink>
					<BSKYIconLink count={item.stats.reposts} postUrl={item.postUrl}>
						<BSKYRepostIcon />
					</BSKYIconLink>
					<BSKYIconLink count={item.stats.likes} postUrl={item.postUrl}>
						<BSKYLikeIcon />
					</BSKYIconLink>
				</div>
			</div>
		</div>
	);
}

function BSKYIconLink({
	children,
	count,
	postUrl,
}: {
	children: React.ReactNode;
	count: number;
	postUrl: string;
}) {
	return (
		<a
			href={postUrl}
			target="_blank"
			rel="noopener noreferrer"
			className={styles.changeLogIconButton}
		>
			{children}
			<span
				className={clsx({
					invisible: count === 0,
				})}
			>
				{count}
			</span>
		</a>
	);
}

*/
