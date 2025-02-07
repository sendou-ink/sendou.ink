import type { MetaFunction } from "@remix-run/node";
import {
	Form,
	Link,
	useLoaderData,
	useNavigate,
	useSearchParams,
} from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "~/components/Alert";
import { Button } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { FormErrors } from "~/components/FormErrors";
import { Input } from "~/components/Input";
import { Main } from "~/components/Main";
import { Pagination } from "~/components/Pagination";
import { SubmitButton } from "~/components/SubmitButton";
import { SearchIcon } from "~/components/icons/Search";
import { useUser } from "~/features/auth/core/user";
import { usePagination } from "~/hooks/usePagination";
import { joinListToNaturalString } from "~/utils/arrays";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	TEAM_SEARCH_PAGE,
	navIconUrl,
	teamPage,
	userSubmittedImage,
} from "~/utils/urls";
import { isAtLeastFiveDollarTierPatreon } from "~/utils/users";
import { TEAM, TEAMS_PER_PAGE } from "../team-constants";

import "../team.css";

import { action } from "../actions/t.server";
import { loader } from "../loaders/t.server";
export { loader, action };

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
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const user = useUser();
	const data = useLoaderData<typeof loader>();

	const isOpen = searchParams.get("new") === "true";

	const close = () => navigate(TEAM_SEARCH_PAGE);

	const canAddNewTeam = () => {
		if (!user) return false;

		if (isAtLeastFiveDollarTierPatreon(user)) {
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
		<Dialog isOpen={isOpen} close={close} className="text-center">
			<Form method="post" className="stack md">
				<h2 className="text-sm">{t("team:newTeam.header")}</h2>
				<div className="team-search__form-input-container">
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
				<div className="stack horizontal md justify-center mt-4">
					<SubmitButton>{t("common:actions.create")}</SubmitButton>
					<Button variant="destructive" onClick={close}>
						{t("common:actions.cancel")}
					</Button>
				</div>
			</Form>
		</Dialog>
	);
}
