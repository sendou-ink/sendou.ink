export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `create index user_friend_code_user_id on "UserFriendCode"("userId")`,
		).run();
	})();
}
