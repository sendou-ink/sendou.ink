import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { LinkButton } from "~/components/Button";
import { FormMessage } from "~/components/FormMessage";
import { WeaponImage } from "~/components/Image";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { ArrowLeftIcon } from "~/components/icons/ArrowLeft";
import type { Tables } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	LFG_PAGE,
	SENDOUQ_SETTINGS_PAGE,
	navIconUrl,
	userEditProfilePage,
} from "~/utils/urls";
import { LFG, TEAM_POST_TYPES, TIMEZONES } from "../lfg-constants";

import { action } from "../actions/lfg.new.server";
import { loader } from "../loaders/lfg.new.server";
export { loader, action };

export const handle: SendouRouteHandle = {
	i18n: ["lfg"],
	breadcrumb: () => ({
		imgPath: navIconUrl("lfg"),
		href: LFG_PAGE,
		type: "IMAGE",
	}),
};

export default function LFGNewPostPage() {
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const fetcher = useFetcher();
	const { t } = useTranslation(["common", "lfg"]);
	const availableTypes = useAvailablePostTypes();
	const [type, setType] = React.useState(data.postToEdit?.type ?? LFG.types[0]);

	if (availableTypes.length === 0) {
		return (
			<Main halfWidth className="stack items-center">
				<h2 className="text-lg mb-4">{t("lfg:new.noMorePosts")}</h2>
				<LinkButton to={LFG_PAGE} icon={<ArrowLeftIcon />}>
					{t("common:actions.goBack")}
				</LinkButton>
			</Main>
		);
	}

	return (
		<Main halfWidth>
			<h2 className="text-lg mb-4">
				{data.postToEdit ? "Editing LFG post" : "New LFG post"}
			</h2>
			<fetcher.Form className="stack md items-start" method="post">
				{data.postToEdit ? (
					<input type="hidden" name="postId" value={data.postToEdit.id} />
				) : null}
				<TypeSelect
					type={type}
					setType={setType}
					availableTypes={availableTypes}
				/>
				<TimezoneSelect />
				<Textarea />
				{user?.plusTier && type !== "COACH_FOR_TEAM" ? (
					<PlusVisibilitySelect />
				) : null}
				<Languages />
				{type !== "COACH_FOR_TEAM" && <WeaponPool />}
				<SubmitButton state={fetcher.state}>
					{t("common:actions.submit")}
				</SubmitButton>
			</fetcher.Form>
		</Main>
	);
}

const useAvailablePostTypes = () => {
	const data = useLoaderData<typeof loader>();

	return (
		LFG.types
			// can't look for a team, if not in one
			.filter((type) => data.team || !TEAM_POST_TYPES.includes(type))
			// can't post two posts of same type
			.filter(
				(type) =>
					!data.userPostTypes.includes(type) || data.postToEdit?.type === type,
			)
	);
};

function TypeSelect({
	type,
	setType,
	availableTypes,
}: {
	type: Tables["LFGPost"]["type"];
	setType: (type: Tables["LFGPost"]["type"]) => void;
	availableTypes: Tables["LFGPost"]["type"][];
}) {
	const { t } = useTranslation(["lfg"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div>
			<Label>{t("lfg:new.type.header")}</Label>
			{data.postToEdit ? (
				<input type="hidden" name="type" value={type} />
			) : null}
			<select
				name="type"
				value={type}
				onChange={(e) => setType(e.target.value as Tables["LFGPost"]["type"])}
				disabled={Boolean(data.postToEdit)}
			>
				{availableTypes.map((type) => (
					<option key={type} value={type}>
						{t(`lfg:types.${type}`)}{" "}
						{data.team && TEAM_POST_TYPES.includes(type)
							? `(${data.team.name})`
							: ""}
					</option>
				))}
			</select>
		</div>
	);
}

function TimezoneSelect() {
	const { t } = useTranslation(["lfg"]);
	const data = useLoaderData<typeof loader>();
	const [selected, setSelected] = React.useState(
		data.postToEdit?.timezone ?? TIMEZONES[0],
	);

	React.useEffect(() => {
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (!TIMEZONES.includes(timezone)) return;

		setSelected(timezone);
	}, []);

	return (
		<div>
			<Label>{t("lfg:new.timezone.header")}</Label>
			<select
				name="timezone"
				onChange={(e) => setSelected(e.target.value)}
				value={selected}
			>
				{TIMEZONES.map((tz) => (
					<option key={tz} value={tz}>
						{tz}
					</option>
				))}
			</select>
		</div>
	);
}

function Textarea() {
	const { t } = useTranslation(["lfg"]);
	const data = useLoaderData<typeof loader>();
	const [value, setValue] = React.useState(data.postToEdit?.text ?? "");

	return (
		<div>
			<Label
				htmlFor="postText"
				valueLimits={{ current: value.length, max: LFG.MAX_TEXT_LENGTH }}
			>
				{t("lfg:new.text.header")}
			</Label>
			<textarea
				id="postText"
				name="postText"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				maxLength={LFG.MAX_TEXT_LENGTH}
				required
			/>
		</div>
	);
}

function PlusVisibilitySelect() {
	const { t } = useTranslation(["lfg"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const [selected, setSelected] = React.useState<number | "">(
		data.postToEdit?.plusTierVisibility ?? "",
	);

	const options = [1, 2, 3].filter(
		(tier) => user?.plusTier && tier >= user?.plusTier,
	);

	return (
		<div>
			<Label>{t("lfg:new.visibility.header")}</Label>
			<select
				name="plusTierVisibility"
				onChange={(e) =>
					setSelected(e.target.value === "" ? "" : Number(e.target.value))
				}
				value={selected}
			>
				{options.map((tier) => (
					<option key={tier} value={tier}>
						+{tier} {tier > 1 ? t("lfg:filters.orAbove") : ""}
					</option>
				))}
				<option value="">{t("lfg:new.visibility.everyone")}</option>
			</select>
		</div>
	);
}

function Languages() {
	const { t } = useTranslation(["lfg"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div>
			<Label>{t("lfg:new.languages.header")}</Label>
			<div className="stack horizontal sm">
				{data.languages?.join(" / ").toUpperCase()}
			</div>
			<FormMessage type="info">
				{t("lfg:new.editOn")}{" "}
				<Link to={SENDOUQ_SETTINGS_PAGE} target="_blank" rel="noreferrer">
					{t("lfg:new.languages.sqSettingsPage")}
				</Link>
			</FormMessage>
		</div>
	);
}

function WeaponPool() {
	const { t } = useTranslation(["lfg"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();

	return (
		<div>
			<Label>{t("lfg:new.weaponPool.header")}</Label>
			<div className="stack horizontal sm">
				{data.weaponPool?.map(({ weaponSplId }) => (
					<WeaponImage
						key={weaponSplId}
						weaponSplId={weaponSplId}
						size={32}
						variant="build"
					/>
				))}
			</div>
			<FormMessage type="info">
				{t("lfg:new.editOn")}{" "}
				<Link to={userEditProfilePage(user!)} target="_blank" rel="noreferrer">
					{t("lfg:new.weaponPool.userProfile")}
				</Link>
			</FormMessage>
		</div>
	);
}
