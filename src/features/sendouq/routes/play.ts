import { type LoaderFunction, redirect } from "react-router";
import { SENDOUQ_PAGE } from "~/utils/urls";

// SendouQ's old URL was /play
export const loader: LoaderFunction = () => {
	throw redirect(SENDOUQ_PAGE);
};
