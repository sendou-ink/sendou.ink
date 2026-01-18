import { Trash } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { WeaponImage } from "~/components/Image";
import { Label } from "~/components/Label";
import { RequiredHiddenInput } from "~/components/RequiredHiddenInput";
import { SubmitButton } from "~/components/SubmitButton";
import { WeaponSelect } from "~/components/WeaponSelect";
import { useUser } from "~/features/auth/core/user";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { SENDOUQ_SETTINGS_PAGE } from "~/utils/urls";
import { action } from "../actions/to.$id.subs.new.server";
import { loader } from "../loaders/to.$id.subs.new.server";
import { TOURNAMENT_SUB } from "../tournament-subs-constants";
export { action, loader };

import clsx from "clsx";
import { mainStyles } from "~/components/Main";
import styles from "./to.$id.subs.new.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["user"],
};

export default function NewTournamentSubPage() {
	const user = useUser();
	const { t } = useTranslation(["common", "tournament"]);
	const data = useLoaderData<typeof loader>();

	const [bestWeapons, setBestWeapons] = React.useState<MainWeaponId[]>(
		data.sub ? data.sub.bestWeapons : (data.userDefaults?.bestWeapons ?? []),
	);
	const [okWeapons, setOkWeapons] = React.useState<MainWeaponId[]>(
		data.sub
			? (data.sub.okWeapons ?? [])
			: (data.userDefaults?.okWeapons ?? []),
	);

	return (
		<div className={mainStyles.narrow}>
			<Form method="post" className="stack md items-start">
				<div className="stack">
					<h2>{t("tournament:subs.addPost")}</h2>
					<FormMessage type="info">
						{t("tournament:subs.defaultsNote")}{" "}
						<Link to={SENDOUQ_SETTINGS_PAGE}>
							{t("tournament:subs.defaultsPage")}
						</Link>
					</FormMessage>
				</div>
				<VCRadios />
				<WeaponPoolSelect
					label={t("tournament:subs.weapons.prefer.header")}
					weapons={bestWeapons}
					otherWeapons={okWeapons}
					setWeapons={setBestWeapons}
					id="bestWeapons"
					infoText={t("tournament:subs.weapons.info", {
						min: 1,
						max: TOURNAMENT_SUB.WEAPON_POOL_MAX_SIZE,
					})}
					required
				/>
				<WeaponPoolSelect
					label={t("tournament:subs.weapons.ok.header")}
					weapons={okWeapons}
					otherWeapons={bestWeapons}
					setWeapons={setOkWeapons}
					id="okWeapons"
					infoText={t("tournament:subs.weapons.info", {
						min: 0,
						max: TOURNAMENT_SUB.WEAPON_POOL_MAX_SIZE,
					})}
				/>
				<Message />
				{user?.plusTier ? <VisibilityRadios /> : null}
				<SubmitButton>{t("common:actions.save")}</SubmitButton>
			</Form>
		</div>
	);
}

function VCRadios() {
	const { t } = useTranslation(["common", "tournament"]);
	const data = useLoaderData<typeof loader>();

	const isDefaultChecked = (value: number) => {
		if (data.sub) {
			return data.sub.canVc === value;
		}

		const defaultCanVc = data.userDefaults?.canVc ?? 1;

		return defaultCanVc === value;
	};

	return (
		<div>
			<Label required>{t("tournament:subs.vc.header")}</Label>
			<div className="stack xs">
				<div className="stack horizontal sm items-center">
					<input
						type="radio"
						id="vc-true"
						name="canVc"
						value="1"
						required
						defaultChecked={isDefaultChecked(1)}
					/>
					<label htmlFor="vc-true" className="mb-0">
						{t("common:yes")}
					</label>
				</div>
				<div className="stack horizontal sm items-center">
					<input
						type="radio"
						id="vc-false"
						name="canVc"
						value="0"
						defaultChecked={isDefaultChecked(0)}
					/>
					<label htmlFor="vc-false" className="mb-0">
						{t("common:no")}
					</label>
				</div>
				<div className="stack horizontal sm items-center">
					<input
						type="radio"
						id="vc-listen-only"
						name="canVc"
						value="2"
						defaultChecked={isDefaultChecked(2)}
					/>
					<label htmlFor="vc-listen-only" className="mb-0">
						{t("tournament:subs.listenOnlyVC")}
					</label>
				</div>
			</div>
		</div>
	);
}

function Message() {
	const { t } = useTranslation(["tournament"]);
	const data = useLoaderData<typeof loader>();
	const [value, setValue] = React.useState(
		data.sub?.message ?? data.userDefaults?.message ?? "",
	);

	return (
		<div className="u-edit__bio-container">
			<Label
				htmlFor="message"
				valueLimits={{
					current: value.length,
					max: TOURNAMENT_SUB.MESSAGE_MAX_LENGTH,
				}}
			>
				{t("tournament:subs.message.header")}
			</Label>
			<textarea
				id="message"
				name="message"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				maxLength={TOURNAMENT_SUB.MESSAGE_MAX_LENGTH}
			/>
		</div>
	);
}

function VisibilityRadios() {
	const { t } = useTranslation(["tournament"]);
	const data = useLoaderData<typeof loader>();
	const user = useUser();

	const userPlusTier = user?.plusTier ?? 4;

	return (
		<div>
			<Label required>{t("tournament:subs.visibility.header")}</Label>
			<div className="stack xs">
				{[1, 2, 3]
					.filter((tier) => tier >= userPlusTier)
					.map((tier) => {
						const id = `+${tier}`;

						return (
							<div key={tier} className="stack horizontal sm items-center">
								<input
									type="radio"
									id={id}
									name="visibility"
									value={id}
									defaultChecked={data.sub?.visibility === id}
								/>
								<label htmlFor={id} className="mb-0">
									+{tier} {tier !== 1 && "(and above)"}
								</label>
							</div>
						);
					})}
				<div className="stack horizontal sm items-center">
					<input
						type="radio"
						id="all"
						name="visibility"
						value="ALL"
						required
						defaultChecked={data.sub?.visibility === "ALL"}
					/>
					<label htmlFor="all" className="mb-0">
						{t("tournament:subs.visibility.everyone")}
					</label>
				</div>
			</div>
		</div>
	);
}

function WeaponPoolSelect({
	weapons,
	otherWeapons,
	setWeapons,
	label,
	id,
	infoText,
	required = false,
}: {
	weapons: Array<MainWeaponId>;
	otherWeapons: Array<MainWeaponId>;
	setWeapons: (weapons: Array<MainWeaponId>) => void;
	label: string;
	id: string;
	infoText: string;
	required?: boolean;
}) {
	const { t } = useTranslation(["user"]);

	return (
		<div className={clsx("stack md", styles.weaponPool)}>
			<RequiredHiddenInput
				isValid={!required || weapons.length > 0}
				name={id}
				value={JSON.stringify(weapons)}
			/>
			{weapons.length < TOURNAMENT_SUB.WEAPON_POOL_MAX_SIZE ? (
				<>
					<WeaponSelect
						label={label}
						onChange={(weaponId) => {
							setWeapons([...weapons, weaponId]);
						}}
						disabledWeaponIds={[...weapons, ...otherWeapons]}
						// empty on selection
						key={weapons[weapons.length - 1]}
					/>
					<FormMessage type="info">{infoText}</FormMessage>
				</>
			) : (
				<span className="text-xs text-warning">
					{t("user:forms.errors.maxWeapons")}
				</span>
			)}
			{weapons.length > 0 ? (
				<div className="stack horizontal sm justify-center">
					{weapons.map((weapon) => {
						return (
							<div key={weapon} className="stack xs">
								<div className={styles.selectedWeapon}>
									<WeaponImage
										weaponSplId={weapon}
										variant="badge"
										width={38}
										height={38}
									/>
								</div>
								<SendouButton
									icon={<Trash />}
									variant="minimal-destructive"
									aria-label="Delete weapon"
									onPress={() =>
										setWeapons(weapons.filter((w) => w !== weapon))
									}
								/>
							</div>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
