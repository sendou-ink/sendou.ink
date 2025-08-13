import { form } from '$app/server';

export const updateProfile = form(async (data) => {
	await new Promise((resolve) => setTimeout(resolve, 1500));
	console.log(data);
	return null;
});
