import type { MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { LocaleTime } from "~/components/LocaleTime";
import { Main } from "~/components/Main";
import { SendouForm } from "~/form/SendouForm";
import { metaTags } from "~/utils/remix";
import { action } from "../actions/admin.streams.server";
import { createExternalStreamSchema } from "../admin-schemas";
import { loader } from "../loaders/admin.streams.server";

import styles from "./admin.streams.module.css";

export { action, loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "External streams",
		location: args.location,
	});
};

export default function AdminStreamsPage() {
	return (
		<Main className="stack lg">
			<SendouForm
				schema={createExternalStreamSchema}
				title="Add external stream"
			>
				{({ FormField }) => (
					<>
						<FormField name="name" />
						<FormField name="url" />
						<FormField name="avatar" />
						<FormField name="startTime" />
					</>
				)}
			</SendouForm>
			<ExternalStreamList />
		</Main>
	);
}

function ExternalStreamList() {
	const { streams } = useLoaderData<typeof loader>();

	if (streams.length === 0) {
		return <div className="text-lighter">No external streams</div>;
	}

	return (
		<div className="stack md">
			<h2>Current external streams</h2>
			<ul className="stack sm">
				{streams.map((stream) => (
					<li key={stream.id} className={styles.streamRow}>
						{stream.avatarUrl ? (
							<img
								src={stream.avatarUrl}
								alt=""
								className={styles.streamAvatar}
							/>
						) : null}
						<div className="stack xxs">
							<Link to={stream.url} className="text-main-forced">
								{stream.name}
							</Link>
							<span className="text-xs text-lighter">
								<LocaleTime
									date={stream.startTime}
									inline
									options={{
										month: "numeric",
										day: "numeric",
										hour: "numeric",
										minute: "numeric",
									}}
								/>
							</span>
						</div>
						<FormWithConfirm
							dialogHeading={`Delete external stream "${stream.name}"?`}
							fields={[
								["_action", "DELETE"],
								["id", stream.id],
							]}
						>
							<SendouButton variant="minimal-destructive" className="ml-auto">
								Delete
							</SendouButton>
						</FormWithConfirm>
					</li>
				))}
			</ul>
		</div>
	);
}
