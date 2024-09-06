import mysql from "promise-mysql";
import bcrypt from "bcrypt";

import Config from "../server/config";

void (async () => {
	let db = await mysql.createConnection({
		host: Config.database.host,
		user: Config.database.user,
		password: Config.database.password
	});

	// check the database name to be valid
	if (!Config.database.database.match(/^[a-zA-Z0-9_]+$/)) {
		return;
	}

	await db.query(`CREATE DATABASE ${Config.database.database}`);

	await db.end();

	db = await mysql.createConnection(Config.database);

	// create the tables
	await db.query(
		"CREATE TABLE users (uid int NOT NULL KEY auto_increment, admin bool NOT NULL DEFAULT 0, name text NOT NULL, password binary(62) NOT NULL)"
	);
	await db.query(
		"CREATE TABLE posts (pid int NOT NULL KEY auto_increment, content text NOT NULL DEFAULT '', date char(14) NOT NULL UNIQUE)"
	);
	await db.query(
		"CREATE TABLE comments (cid int NOT NULL KEY auto_increment, pid int NOT NULL, uid int NOT NULL, text text NOT NULL, answer text)"
	);

	// populate the posts
	const start_date = new Date(Config.setup.start);

	function format_date(dt: Date): string {
		return [
			dt.getFullYear().toString(),
			(dt.getMonth() + 1).toString().padStart(2, "0"),
			dt.getDate().toString().padStart(2, "0")
		].join("-");
	}

	await Promise.all(
		Array.from(Array(Config.setup.days).keys()).map(async (offset) => {
			const this_date = new Date(start_date.valueOf());

			this_date.setDate(this_date.getDate() + offset);

			const dt = format_date(this_date);

			await db.query("INSERT INTO posts (date) VALUES (?)", [dt]);
		})
	);

	// create the admin-user
	const password_chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜabcdefghijklmnopqrstuvwxyzäöüß0123456789!§$%&/()=?+#";
	const password_length = 20;
	let password = "";
	for (let ii = 0; ii < password_length; ii++) {
		password += password_chars[Math.floor(Math.random() * password_chars.length)];
	}

	const salt = await bcrypt.genSalt();
	const password_hash = await bcrypt.hash(password, salt);

	await db.query("INSERT INTO users (name, password, admin) VALUES (?, ?, ?)", [
		"admin",
		password_hash,
		1
	]);

	await db.end();

	console.log(`admin-user is: 'admin' '${password}'`);
})();
