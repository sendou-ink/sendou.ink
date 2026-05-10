import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Form, Link, useFetcher, useLoaderData } from "react-router";
import { CustomThemeSelector } from "~/components/CustomThemeSelector";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { FormErrors } from "~/components/FormErrors";
import { FormMessage } from "~/components/FormMessage";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { Main, mainStyles } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { TeamGoBackButton } from "~/features/team/components/TeamGoBackButton";
import type { ThemeInput } from "~/utils/oklch-gamut";
import { metaTags } from "~/utils/remix";
import { uploadImagePage } from "~/utils/urls";
import { action } from "../actions/t.$customUrl.edit.server";
import { loader } from "../loaders/t.$customUrl.edit.server";
import styles from "../team.module.css";
import { TEAM } from "../team-constants";
import { isTeamOwner } from "../team-utils";

export { action, loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Editing team",
		location: args.location,
	});
};

export default function EditTeamPage() {
	const { t } = useTranslation(["common", "team"]);
	const user = useUser();
	const { team, canAddCustomizedColors } = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<TeamGoBackButton />
			<div className={mainStyles.narrow}>
				{isTeamOwner({ team, user }) ? (
					<FormWithConfirm
						dialogHeading={t("team:deleteTeam.header", { teamName: team.name })}
						fields={[["_action", "DELETE_TEAM"]]}
					>
						<SendouButton
							className="ml-auto"
							variant="minimal-destructive"
							data-testid="delete-team-button"
						>
							{t("team:actionButtons.deleteTeam")}
						</SendouButton>
					</FormWithConfirm>
				) : null}
				<Form method="post" className="stack md items-start">
					<ImageUploadLinks />
					<ImageRemoveButtons />
					<NameInput />
					<TagInput />
					<BlueskyInput />
					<BioTextarea />
					<SubmitButton
						className="mt-4"
						_action="EDIT"
						testId="edit-team-submit-button"
					>
						{t("common:actions.submit")}
					</SubmitButton>
					<FormErrors namespace="team" />
				</Form>
				{canAddCustomizedColors ? (
					<>
						<Divider className={styles.formDivider} smallText>
							{t("team:forms.customTheme.header")}
						</Divider>
						<TeamCustomThemeSelector />
					</>
				) : null}
			</div>
		</Main>
	);
}

function ImageUploadLinks() {
	const { t } = useTranslation(["team"]);
	const { team } = useLoaderData<typeof loader>();

	return (
		<div>
			<Label>{t("team:forms.fields.uploadImages")}</Label>
			<ol className={styles.imageLinksList}>
				<li>
					<Link
						to={uploadImagePage({
							type: "team-pfp",
							teamCustomUrl: team.customUrl,
						})}
					>
						{t("team:forms.fields.uploadImages.pfp")}
					</Link>
				</li>
				<li>
					<Link
						to={uploadImagePage({
							type: "team-banner",
							teamCustomUrl: team.customUrl,
						})}
					>
						{t("team:forms.fields.uploadImages.banner")}
					</Link>
				</li>
			</ol>
		</div>
	);
}

function ImageRemoveButtons() {
	const { t } = useTranslation(["common", "team"]);
	const { team } = useLoaderData<typeof loader>();

	return team.avatarUrl || team.bannerUrl ? (
		<div>
			<Label>{t("team:forms.fields.removeImages")}</Label>
			<ol className={styles.imageLinksList}>
				{team.avatarUrl ? (
					<li>
						<FormWithConfirm
							dialogHeading={t("team:deleteTeam.profilePicture.header", {
								teamName: team.name,
							})}
							fields={[["_action", "DELETE_AVATAR"]]}
							submitButtonText={t("common:actions.remove")}
						>
							<SendouButton className="ml-auto" variant="minimal-destructive">
								{t("team:actionButtons.deleteTeam.profilePicture")}
							</SendouButton>
						</FormWithConfirm>
					</li>
				) : null}
				{team.bannerUrl ? (
					<li>
						<FormWithConfirm
							dialogHeading={t("team:deleteTeam.banner.header", {
								teamName: team.name,
							})}
							fields={[["_action", "DELETE_BANNER"]]}
							submitButtonText={t("common:actions.remove")}
						>
							<SendouButton className="ml-auto" variant="minimal-destructive">
								{t("team:actionButtons.deleteTeam.banner")}
							</SendouButton>
						</FormWithConfirm>
					</li>
				) : null}
			</ol>
		</div>
	) : null;
}

function NameInput() {
	const { t } = useTranslation(["common", "team"]);
	const { team } = useLoaderData<typeof loader>();

	return (
		<div>
			<Label htmlFor="title" required>
				{t("common:forms.name")}
			</Label>
			<input
				id="name"
				name="name"
				required
				minLength={TEAM.NAME_MIN_LENGTH}
				maxLength={TEAM.NAME_MAX_LENGTH}
				defaultValue={team.name}
				data-testid="name-input"
			/>
			<FormMessage type="info">{t("team:forms.info.name")}</FormMessage>
		</div>
	);
}

function TagInput() {
	const { t } = useTranslation(["team"]);
	const { team } = useLoaderData<typeof loader>();
	const [value, setValue] = React.useState(team.tag ?? "");

	return (
		<div>
			<Label htmlFor="tag">{t("team:forms.fields.tag")}</Label>
			<input
				id="tag"
				name="tag"
				maxLength={TEAM.TAG_MAX_LENGTH}
				value={value}
				onChange={(e) => setValue(e.target.value)}
			/>
			<FormMessage type="info">{t("team:forms.info.tag")}</FormMessage>
		</div>
	);
}

function BlueskyInput() {
	const { t } = useTranslation(["team"]);
	const { team } = useLoaderData<typeof loader>();
	const [value, setValue] = React.useState(team.bsky ?? "");

	return (
		<div>
			<Label htmlFor="bsky">{t("team:forms.fields.teamBsky")}</Label>
			<Input
				leftAddon="https://bsky.app/profile/"
				id="bsky"
				name="bsky"
				maxLength={TEAM.BSKY_MAX_LENGTH}
				value={value}
				onChange={(e) => setValue(e.target.value)}
			/>
		</div>
	);
}

function BioTextarea() {
	const { t } = useTranslation(["team"]);
	const { team } = useLoaderData<typeof loader>();
	const [value, setValue] = React.useState(team.bio ?? "");

	return (
		<div className="w-full">
			<Label
				htmlFor="bio"
				valueLimits={{ current: value.length, max: TEAM.BIO_MAX_LENGTH }}
			>
				{t("team:forms.fields.bio")}
			</Label>
			<textarea
				id="bio"
				name="bio"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				maxLength={TEAM.BIO_MAX_LENGTH}
				data-testid="bio-textarea"
				className="w-full"
			/>
		</div>
	);
}

function TeamCustomThemeSelector() {
	const { customTheme, canAddCustomizedColors } =
		useLoaderData<typeof loader>();
	const fetcher = useFetcher();

	const handleSave = (themeInput: ThemeInput) => {
		fetcher.submit(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: themeInput,
			} as unknown as Parameters<typeof fetcher.submit>[0],
			{ method: "post", encType: "application/json" },
		);
	};

	const handleReset = () => {
		fetcher.submit(
			{ _action: "UPDATE_CUSTOM_THEME", newValue: null },
			{ method: "post", encType: "application/json" },
		);
	};

	return (
		<CustomThemeSelector
			initialTheme={customTheme}
			isSupporter={canAddCustomizedColors}
			isPersonalTheme={false}
			onSave={handleSave}
			onReset={handleReset}
			fetcherState={fetcher.state}
		/>
	);
}
