import clsx from "clsx";
import { add, sub } from "date-fns";
import React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import * as R from "remeda";
import { ActionButton } from "~/components/ActionButton";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import { FilterBar } from "~/components/filter-bar/FilterBar";
import { WeaponImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { WeaponSelect } from "~/components/WeaponSelect";
import { useUser } from "~/features/auth/core/user";
import { TIERS } from "~/features/mmr/mmr-constants";
import { languagesUnified } from "~/modules/i18n/config";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { databaseTimestampToDate } from "~/utils/dates";
import { metaTags, type SerializeFrom } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import type { Unpacked } from "~/utils/types";
import { LFG_PAGE, navIconUrl } from "~/utils/urls";
import { action } from "../actions/lfg.server";
import { LFGPost } from "../components/LFGPost";
import { filterPosts } from "../core/filtering";
import { LFG } from "../lfg-constants";
import { lfgActionSchema } from "../lfg-schemas";
import { lfgSearchParams } from "../lfg-search-params";
import { loader } from "../loaders/lfg.server";
import styles from "./lfg.module.css";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["lfg", "user", "q"],
	breadcrumb: () => ({
		imgPath: navIconUrl("lfg"),
		href: LFG_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "LFG",
		ogTitle: "Splatoon LFG (looking for players, teams & coaches)",
		description:
			"Find people to play Splatoon with. Create a post or browse existing ones. For looking players, teams, scrim partners and coaches alike.",
		location: args.location,
	});
};

export type LFGLoaderData = SerializeFrom<typeof loader>;
export type LFGLoaderPost = Unpacked<LFGLoaderData["posts"]>;
export type TiersMap = ReturnType<typeof unserializeTiers>;

const unserializeTiers = (data: SerializeFrom<typeof loader>) =>
	new Map(data.tiersMap);

export default function LFGPage() {
	const { t } = useTranslation(["common", "lfg"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const [filterValues] = useSearchParamsTyped(lfgSearchParams);

	const tiersMap = React.useMemo(() => unserializeTiers(data), [data]);

	const filteredPosts = filterPosts(data.posts, filterValues, tiersMap);

	const showExpiryAlert = (post: Unpacked<LFGLoaderData["posts"]>) => {
		if (post.author.id !== user?.id) return false;

		const expiryDate = add(databaseTimestampToDate(post.updatedAt), {
			days: LFG.POST_FRESHNESS_DAYS,
		});
		const expiryCloseDate = sub(expiryDate, { days: 7 });

		if (new Date() < expiryCloseDate) return false;

		return true;
	};

	return (
		<Main className="stack xl">
			<Filters />
			{filteredPosts.map((post) => (
				<div
					key={post.id}
					id={String(post.id)}
					className={clsx("stack sm", styles.post)}
				>
					{showExpiryAlert(post) ? <PostExpiryAlert postId={post.id} /> : null}
					<LFGPost post={post} />
				</div>
			))}
			{filteredPosts.length === 0 ? (
				<div className="text-lighter text-lg font-semi-bold text-center mt-6">
					{t("lfg:noPosts")}
				</div>
			) : null}
		</Main>
	);
}

function Filters() {
	const { t } = useTranslation(["lfg"]);
	const [
		{ weapons, type, timezone, language, plusTier, minTier, maxTier },
		setParams,
	] = useSearchParamsTyped(lfgSearchParams);

	return (
		<FilterBar
			pills={[
				{
					key: "weapons",
					name: t("lfg:filters.Weapon"),
					formattedValue:
						weapons.length > 0 ? (
							<span className="stack horizontal xs">
								{weapons.map((weaponSplId) => (
									<WeaponImage
										key={weaponSplId}
										weaponSplId={weaponSplId}
										size={18}
										variant="badge"
									/>
								))}
							</span>
						) : null,
					onRemove: () => setParams({ weapons: [] }),
					popover: (
						<WeaponsPopover
							weapons={weapons}
							onChange={(newWeapons) => setParams({ weapons: newWeapons })}
						/>
					),
				},
				{
					key: "type",
					name: t("lfg:filters.Type"),
					formattedValue: type !== null ? t(`lfg:types.${type}`) : null,
					onAdd: () => setParams({ type: "PLAYER_FOR_TEAM" }),
					onRemove: () => setParams({ type: null }),
					popover: (
						<select
							aria-label={t("lfg:filters.Type")}
							className="w-full"
							value={type ?? "PLAYER_FOR_TEAM"}
							onChange={(e) =>
								setParams({ type: e.target.value as typeof type })
							}
						>
							{LFG.types.map((option) => (
								<option key={option} value={option}>
									{t(`lfg:types.${option}`)}
								</option>
							))}
						</select>
					),
				},
				{
					key: "language",
					name: t("lfg:filters.Language"),
					formattedValue:
						language !== null
							? (languagesUnified.find((lang) => lang.code === language)
									?.name ?? language)
							: null,
					onAdd: () => setParams({ language: "en" }),
					onRemove: () => setParams({ language: null }),
					popover: (
						<select
							aria-label={t("lfg:filters.Language")}
							className="w-full"
							value={language ?? "en"}
							onChange={(e) =>
								setParams({ language: e.target.value as typeof language })
							}
						>
							{languagesUnified.map((option) => (
								<option key={option.code} value={option.code}>
									{option.name}
								</option>
							))}
						</select>
					),
				},
				{
					key: "plusTier",
					name: t("lfg:filters.PlusTier"),
					formattedValue:
						plusTier !== null
							? plusTier === 1
								? "+1"
								: `+${plusTier} ${t("lfg:filters.orAbove")}`
							: null,
					onAdd: () => setParams({ plusTier: 3 }),
					onRemove: () => setParams({ plusTier: null }),
					popover: (
						<select
							aria-label={t("lfg:filters.PlusTier")}
							className="w-full"
							value={plusTier ?? 3}
							onChange={(e) => setParams({ plusTier: Number(e.target.value) })}
						>
							<option value="1">+1</option>
							<option value="2">+2 {t("lfg:filters.orAbove")}</option>
							<option value="3">+3 {t("lfg:filters.orAbove")}</option>
						</select>
					),
				},
				{
					key: "timezone",
					name: t("lfg:filters.Timezone"),
					formattedValue: timezone !== null ? `±${timezone}h` : null,
					onAdd: () => setParams({ timezone: 3 }),
					onRemove: () => setParams({ timezone: null }),
					popover: (
						<input
							aria-label={t("lfg:filters.Timezone")}
							className="w-full"
							type="number"
							value={timezone ?? 3}
							min={0}
							max={12}
							onChange={(e) => setParams({ timezone: Number(e.target.value) })}
						/>
					),
				},
				{
					key: "minTier",
					name: t("lfg:filters.MinTier"),
					formattedValue:
						minTier !== null ? R.capitalize(minTier.toLowerCase()) : null,
					onAdd: () => setParams({ minTier: "GOLD" }),
					onRemove: () => setParams({ minTier: null }),
					popover: (
						<TierSelect
							label={t("lfg:filters.MinTier")}
							value={minTier ?? "GOLD"}
							onChange={(tier) => setParams({ minTier: tier })}
						/>
					),
				},
				{
					key: "maxTier",
					name: t("lfg:filters.MaxTier"),
					formattedValue:
						maxTier !== null ? R.capitalize(maxTier.toLowerCase()) : null,
					onAdd: () => setParams({ maxTier: "PLATINUM" }),
					onRemove: () => setParams({ maxTier: null }),
					popover: (
						<TierSelect
							label={t("lfg:filters.MaxTier")}
							value={maxTier ?? "PLATINUM"}
							onChange={(tier) => setParams({ maxTier: tier })}
						/>
					),
				},
			]}
		/>
	);
}

function WeaponsPopover({
	weapons,
	onChange,
}: {
	weapons: MainWeaponId[];
	onChange: (weapons: MainWeaponId[]) => void;
}) {
	return (
		<div className="stack sm">
			<WeaponSelect
				disabledWeaponIds={weapons}
				onChange={(weaponId) =>
					onChange(
						weapons.length >= LFG.MAX_WEAPON_FILTERS
							? [...weapons.slice(1, LFG.MAX_WEAPON_FILTERS), weaponId]
							: [...weapons, weaponId],
					)
				}
				key={weapons.join("-")}
			/>
			{weapons.length > 0 ? (
				<div className="stack horizontal sm flex-wrap">
					{weapons.map((weapon) => (
						<SendouButton
							key={weapon}
							variant="minimal"
							onPress={() =>
								onChange(weapons.filter((weaponId) => weaponId !== weapon))
							}
						>
							<WeaponImage weaponSplId={weapon} size={32} variant="badge" />
						</SendouButton>
					))}
				</div>
			) : null}
		</div>
	);
}

function TierSelect({
	label,
	value,
	onChange,
}: {
	label: string;
	value: (typeof TIERS)[number]["name"];
	onChange: (tier: (typeof TIERS)[number]["name"]) => void;
}) {
	return (
		<select
			aria-label={label}
			className="w-full"
			value={value}
			onChange={(e) => onChange(e.target.value as typeof value)}
		>
			{TIERS.map((tier) => (
				<option key={tier.name} value={tier.name}>
					{R.capitalize(tier.name.toLowerCase())}
				</option>
			))}
		</select>
	);
}

function PostExpiryAlert({ postId }: { postId: number }) {
	const { t } = useTranslation(["common", "lfg"]);

	return (
		<Alert variation="WARNING">
			<div className="stack md horizontal items-center">
				{t("lfg:expiring")}{" "}
				<ActionButton
					schema={lfgActionSchema}
					action="BUMP_POST"
					fields={{ id: postId }}
					variant="outlined"
					size="small"
				>
					{t("common:actions.clickHere")}
				</ActionButton>
			</div>
		</Alert>
	);
}
