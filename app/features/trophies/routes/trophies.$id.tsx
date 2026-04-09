import { useLoaderData } from "react-router";
import { Trophy } from "../components/Trophy";
import { loader } from "../loaders/trophies.$id.server";
import styles from "./trophies.module.css";

export { loader };

export default function TrophyDetailsPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<div className={styles.trophyDetailsContainer}>
			<Trophy model={data.trophy.model} />
			<div className={styles.trophyDetails}>
				<p>{data.trophy.name}</p>
			</div>
		</div>
	);
}
