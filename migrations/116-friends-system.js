export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
      create table "Friendship" (
        "id" integer primary key,
        "userOneId" integer not null,
        "userTwoId" integer not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        unique("userOneId", "userTwoId") on conflict rollback,
        foreign key ("userOneId") references "User"("id") on delete cascade,
        foreign key ("userTwoId") references "User"("id") on delete cascade
      ) strict`,
		).run();

		db.prepare(
			`create index friendship_user_one_id on "Friendship"("userOneId")`,
		).run();
		db.prepare(
			`create index friendship_user_two_id on "Friendship"("userTwoId")`,
		).run();

		db.prepare(
			/* sql */ `
      create table "FriendRequest" (
        "id" integer primary key,
        "senderId" integer not null,
        "receiverId" integer not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        unique("senderId", "receiverId") on conflict rollback,
        foreign key ("senderId") references "User"("id") on delete cascade,
        foreign key ("receiverId") references "User"("id") on delete cascade
      ) strict`,
		).run();

		db.prepare(
			`create index friend_request_receiver_id on "FriendRequest"("receiverId")`,
		).run();
	})();
}
