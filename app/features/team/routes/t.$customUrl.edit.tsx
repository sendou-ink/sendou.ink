import type { MetaFunction } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { CustomizedColorsInput } from "~/components/CustomizedColorsInput";
import { SendouButton } from "~/components/elements/Button";
import { FormErrors } from "~/components/FormErrors";
import { FormMessage } from "~/components/FormMessage";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { uploadImagePage } from "~/utils/urls";
import { TEAM } from "../team-constants";
import { canAddCustomizedColors, isTeamOwner } from "../team-utils";
import "../team.css";
import { TeamGoBackButton } from "~/features/team/components/TeamGoBackButton";
import { metaTags } from "~/utils/remix";
import { action } from "../actions/t.$customUrl.edit.server";
import { loader } from "../loaders/t.$customUrl.edit.server";
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
	const { team, css } = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<TeamGoBackButton />
			<div className="half-width">
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
					{canAddCustomizedColors(team) ? (
						<CustomizedColorsInput initialColors={css} />
					) : null}
					<NameInput />
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
			<ol className="team__image-links-list">
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

	return team.avatarSrc || team.bannerSrc ? (
		<div>
			<Label>{t("team:forms.fields.removeImages")}</Label>
			<ol className="team__image-links-list">
				{team.avatarSrc ? (
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
				{team.bannerSrc ? (
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
		<div className="u-edit__bio-container">
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
			/>
		</div>
	);
}
