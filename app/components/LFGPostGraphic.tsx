import { useTranslation } from "react-i18next";
import type { Tables } from "~/db/tables";
import {
	GraphicContainer,
	GraphicDateSubtitle,
	GraphicFooter,
	GraphicHeader,
	GraphicSiteUrl,
	GraphicTitle,
} from "~/features/img-export/components/Graphic";
import type { LFGType } from "~/features/lfg/lfg-constants";
import { lfgSearchParams } from "~/features/lfg/lfg-search-params";
import type { UnifiedLanguageCode } from "~/modules/i18n/config";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { databaseTimestampToDate } from "~/utils/dates";
import { LFG_PAGE, resolveAvatarUrl } from "~/utils/urls";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";
import { WeaponImage } from "./Image";
import styles from "./LFGPostGraphic.module.css";

const GRAPHIC_WIDTH = 480;
const WEAPON_SIZE = 40;
const MEMBER_WEAPON_SIZE = 28;

interface LFGPostGraphicUser {
	username: string;
	discordId: string;
	discordAvatar: Tables["User"]["discordAvatar"];
	customAvatarUrl: string | null;
	country: string | null;
	weaponPool: Array<{
		weaponSplId: MainWeaponId;
		isFavorite: boolean | number;
		isTenStar: boolean | number;
	}>;
}

export interface LFGPostGraphicPost {
	id: number;
	type: LFGType;
	text: string;
	updatedAt: number;
	timezone: string;
	languages: UnifiedLanguageCode[] | null;
	author: LFGPostGraphicUser;
	team: {
		name: string;
		avatarUrl: string | null;
		members: Array<LFGPostGraphicUser & { id: number }>;
	} | null;
}

/** Search param carrying the post id so the QR code lands on the post itself */
export const lfgPostGraphicPath = (postId: number) =>
	lfgSearchParams.href(LFG_PAGE, { post: postId });

export function LFGPostGraphic({ post }: { post: LFGPostGraphicPost }) {
	return (
		<GraphicContainer width={GRAPHIC_WIDTH}>
			<PostHeader post={post} />
			<div className={styles.details}>
				{post.team ? null : <WeaponsRow weapons={post.author.weaponPool} />}
				<DetailPills post={post} />
			</div>
			{post.team ? <TeamMembersList members={post.team.members} /> : null}
			<div className={styles.textBox}>{post.text}</div>
			<GraphicFooter>
				<GraphicSiteUrl path={lfgPostGraphicPath(post.id)} />
			</GraphicFooter>
		</GraphicContainer>
	);
}

function PostHeader({ post }: { post: LFGPostGraphicPost }) {
	const { t } = useTranslation(["lfg"]);

	const avatarProps = post.team
		? {
				avatarUrl: post.team.avatarUrl ?? undefined,
				identiconInput: post.team.name,
			}
		: {
				avatarUrl: userAvatarUrl(post.author),
				identiconInput: post.author.discordId,
			};

	return (
		<GraphicHeader
			{...avatarProps}
			titleRow={
				<>
					{!post.team && post.author.country ? (
						<Flag countryCode={post.author.country} tiny />
					) : null}
					<GraphicTitle>{post.team?.name ?? post.author.username}</GraphicTitle>
				</>
			}
			subtitle={
				<GraphicDateSubtitle date={databaseTimestampToDate(post.updatedAt)} />
			}
			trailing={
				<div className={styles.typeBadge}>{t(`lfg:types.${post.type}`)}</div>
			}
			alignTrailingWithTitle
		/>
	);
}

function WeaponsRow({
	weapons,
	size = WEAPON_SIZE,
}: {
	weapons: LFGPostGraphicUser["weaponPool"];
	size?: number;
}) {
	if (weapons.length === 0) return null;

	return (
		<div className={styles.weapons}>
			{weapons.map((weapon) => (
				<WeaponImage key={weapon.weaponSplId} weapon={weapon} size={size} />
			))}
		</div>
	);
}

function DetailPills({ post }: { post: LFGPostGraphicPost }) {
	return (
		<div className={styles.pills}>
			<div className={styles.pill}>{timezoneOffsetLabel(post.timezone)}</div>
			{post.languages && post.languages.length > 0 ? (
				<div className={styles.pill}>{languagesLabel(post.languages)}</div>
			) : null}
		</div>
	);
}

function TeamMembersList({
	members,
}: {
	members: NonNullable<LFGPostGraphicPost["team"]>["members"];
}) {
	return (
		<div className={styles.members}>
			{members.map((member) => (
				<div key={member.id} className={styles.member}>
					<Avatar
						url={userAvatarUrl(member)}
						identiconInput={member.discordId}
						size="xxs"
						alt=""
					/>
					<div className={styles.memberName}>
						{member.country ? <Flag countryCode={member.country} tiny /> : null}
						<span className={styles.memberUsername}>{member.username}</span>
					</div>
					<WeaponsRow weapons={member.weaponPool} size={MEMBER_WEAPON_SIZE} />
				</div>
			))}
		</div>
	);
}

function userAvatarUrl(user: LFGPostGraphicUser) {
	return resolveAvatarUrl({
		customAvatarUrl: user.customAvatarUrl,
		discordId: user.discordId,
		discordAvatar: user.discordAvatar,
		size: "lg",
	});
}

function languagesLabel(languages: UnifiedLanguageCode[]) {
	return languages.join(" / ").toUpperCase();
}

/** e.g. "GMT+3", absolute rather than relative to the viewer since the image travels */
function timezoneOffsetLabel(timezone: string) {
	const offsetPart = new Intl.DateTimeFormat("en", {
		timeZone: timezone,
		timeZoneName: "shortOffset",
	})
		.formatToParts(new Date())
		.find((part) => part.type === "timeZoneName");

	return offsetPart?.value ?? timezone;
}
