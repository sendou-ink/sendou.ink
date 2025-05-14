import type { MetaFunction } from "@remix-run/node";
import { Form, Link, useLoaderData, useSearchParams } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "~/components/Alert";
import { FormErrors } from "~/components/FormErrors";
import { Input } from "~/components/Input";
import { Main } from "~/components/Main";
import { Pagination } from "~/components/Pagination";
import { SubmitButton } from "~/components/SubmitButton";
import { SendouDialog } from "~/components/elements/Dialog";
import { SearchIcon } from "~/components/icons/Search";
import { useUser } from "~/features/auth/core/user";
import { usePagination } from "~/hooks/usePagination";
import { useHasRole } from "~/modules/permissions/hooks";
import { joinListToNaturalString } from "~/utils/arrays";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	TEAM_SEARCH_PAGE,
	navIconUrl,
	teamPage,
	userSubmittedImage,
} from "~/utils/urls";
import { TEAM, TEAMS_PER_PAGE } from "../team-constants";

import { action } from "../actions/t.server";
import { loader } from "../loaders/t.server";
export { loader, action };

import "../team.css";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Team Search",
		ogTitle: "Splatoon team search",
		description:
			"List of all teams on sendou.ink and their members. Search for teams by name or member name.",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["team"],
	breadcrumb: () => ({
		imgPath: navIconUrl("t"),
		href: TEAM_SEARCH_PAGE,
		type: "IMAGE",
	}),
};

export default function TeamSearchPage() {
	const { t } = useTranslation(["team"]);
	const [inputValue, setInputValue] = React.useState("");
	const data = useLoaderData<typeof loader>();

	const filteredTeams = data.teams.filter((team) => {
		if (!inputValue) return true;

		const lowerCaseInput = inputValue.toLowerCase();

		if (team.name.toLowerCase().includes(lowerCaseInput)) return true;
		if (
			team.members.some((m) =>
				m.username.toLowerCase().includes(lowerCaseInput),
			)
		) {
			return true;
		}

		return false;
	});

	const {
		itemsToDisplay,
		everythingVisible,
		currentPage,
		pagesCount,
		nextPage,
		previousPage,
		setPage,
	} = usePagination({
		items: filteredTeams,
		pageSize: TEAMS_PER_PAGE,
	});

	return (
		<Main className="stack lg">
			<NewTeamDialog />
			<Input
				className="team-search__input"
				icon={<SearchIcon className="team-search__icon" />}
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
				placeholder={t("team:teamSearch.placeholder")}
				testId="team-search-input"
			/>
			<div className="mt-6 stack lg">
				{itemsToDisplay.map((team, i) => (
					<Link
						key={team.customUrl}
						to={teamPage(team.customUrl)}
						className="team-search__team"
					>
						{team.avatarSrc ? (
							<img
								src={userSubmittedImage(team.avatarSrc)}
								alt=""
								width={64}
								height={64}
								className="rounded-full"
								loading="lazy"
							/>
						) : (
							<div className="team-search__team__avatar-placeholder">
								{team.name[0]}
							</div>
						)}
						<div>
							<div
								className="team-search__team__name"
								data-testid={`team-${i}`}
							>
								{team.name}
							</div>
							<div className="team-search__team__members">
								{team.members.length === 1
									? team.members[0].username
									: joinListToNaturalString(
											team.members.map((member) => member.username),
											"&",
										)}
							</div>
						</div>
					</Link>
				))}
			</div>
			{!everythingVisible ? (
				<Pagination
					currentPage={currentPage}
					pagesCount={pagesCount}
					nextPage={nextPage}
					previousPage={previousPage}
					setPage={setPage}
				/>
			) : null}
		</Main>
	);
}

function NewTeamDialog() {
	const { t } = useTranslation(["common", "team"]);
	const [searchParams] = useSearchParams();
	const user = useUser();
	const isSupporter = useHasRole("SUPPORTER");
	const data = useLoaderData<typeof loader>();

	const isOpen = searchParams.get("new") === "true";

	const canAddNewTeam = () => {
		if (!user) return false;
		if (isSupporter) {
			return data.teamMemberOfCount < TEAM.MAX_TEAM_COUNT_PATRON;
		}

		return data.teamMemberOfCount < TEAM.MAX_TEAM_COUNT_NON_PATRON;
	};

	if (isOpen && !canAddNewTeam()) {
		return (
			<Alert variation="WARNING">
				You can't add another team (max 2 for non-supporters and 5 for
				supporters).
			</Alert>
		);
	}

	return (
		<SendouDialog
			heading={t("team:newTeam.header")}
			isOpen={isOpen}
			onCloseTo={TEAM_SEARCH_PAGE}
		>
			<Form method="post" className="stack md">
				<div className="">
					<label htmlFor="name">{t("common:forms.name")}</label>
					<input
						id="name"
						name="name"
						minLength={TEAM.NAME_MIN_LENGTH}
						maxLength={TEAM.NAME_MAX_LENGTH}
						required
						data-testid={isOpen ? "new-team-name-input" : undefined}
					/>
				</div>
				<FormErrors namespace="team" />
				<div className="mt-2">
					<SubmitButton>{t("common:actions.create")}</SubmitButton>
				</div>
			</Form>
		</SendouDialog>
	);
}
