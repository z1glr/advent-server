<script setup lang="ts">
	import { onMounted, ref } from "vue";
	import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
	import { faPlus } from "@fortawesome/free-solid-svg-icons";
	import { faFloppyDisk, faTrashCan } from "@fortawesome/free-regular-svg-icons";

	import BaseButton from "@/components/BaseButton.vue";
	import BaseSlider from "@/components/BaseSlider.vue";

	import Global from "@/Global";
	import { api_call, HTTPStatus } from "@/Lib";

	interface User {
		name: string;
		uid: number;
		admin: boolean;
	}
	type PasswordUser = User & { password: string; name: string };

	const users = ref<PasswordUser[]>([]);
	const add_user_name = ref<string>("");
	const add_user_password = ref<string>("");
	const user_exists_error = ref<boolean>(false);

	onMounted(async () => {
		create_password();

		const response = await api_call<User[]>("GET", "users");

		if (response.ok) {
			store_users(response.data);
		}
	});

	function create_password() {
		// create the password
		const password_number = String(Math.floor(Math.random() * 90000000 + 10000000));
		const password = password_number.slice(0, 4) + "-" + password_number.slice(4);

		add_user_password.value = password;
		add_user_name.value = "";
	}

	async function add_user(
		name: string = add_user_name.value,
		password: string = add_user_password.value
	) {
		if (name.length > 0 && password.length > 0) {
			const response = await api_call<User[]>("POST", "users", undefined, { name, password });

			if (response.ok) {
				create_password();

				store_users(response.data);

				user_exists_error.value = false;
			} else {
				if (response.status === HTTPStatus.Conflict) {
					user_exists_error.value = true;
				}
			}
		}
	}

	async function modify_user(user: PasswordUser) {
		if (window.confirm(`Modify user '${user.name}'?`)) {
			const response = await api_call<User[]>(
				"PATCH",
				"users",
				{ uid: user.uid },
				{ password: user.password, admin: user.admin }
			);

			if (response.ok) {
				store_users(response.data);
			}
		}
	}

	async function delete_user(user: PasswordUser) {
		if (!(user.name === "admin" || user.uid === Global.user.value?.uid)) {
			if (window.confirm(`Delete user '${user.name}'?`)) {
				const response = await api_call<User[]>("DELETE", "users", { uid: user.uid });

				if (response.ok) {
					store_users(response.data);
				}
			}
		}
	}

	function store_users(new_users: User[]) {
		users.value = new_users.map((user) => {
			return { ...user, password: "" };
		});
	}
</script>

<template>
	<div id="container">
		<h1>Users</h1>
		<div id="add-user-wrapper">
			<div id="user-exists-error" v-if="user_exists_error">
				User with same username already exists
			</div>
			<div id="add-user">
				<div id="add-user-inputs">
					<span class="input-wrapper"
						><span>username:</span
						><input type="text" v-model="add_user_name" @keydown.enter="add_user()"
					/></span>
					<span class="input-wrapper"
						><span>password:</span
						><input type="text" v-model="add_user_password" @keydown.enter="add_user()"
					/></span>
				</div>
				<BaseButton @click="add_user()"><FontAwesomeIcon :icon="faPlus" /></BaseButton>
			</div>
		</div>
		<table id="users">
			<thead>
				<tr class="bar">
					<th>UID</th>
					<th>Name</th>
					<th>password</th>
					<th>Admin</th>
					<th>Submit</th>
					<th>Delete</th>
				</tr>
			</thead>
			<tbody>
				<tr class="content" v-for="user of users" :key="user.uid">
					<th>{{ user.uid }}</th>
					<th>{{ user.name }}</th>
					<th>
						<div class="cell">
							<input
								v-model="user.password"
								:disabled="user.name === 'admin' && Global.user.value?.uid !== user.uid"
								type="text"
								placeholder="new password"
							/>
						</div>
					</th>
					<th>
						<div class="cell">
							<BaseSlider
								class="slider"
								:disabled="user.name === 'admin' || user.uid === Global.user.value?.uid"
								v-model="user.admin"
							/>
						</div>
					</th>
					<th>
						<div class="cell">
							<BaseButton
								:disabled="user.name === 'admin' && Global.user.value?.uid !== user.uid"
								@click="modify_user(user)"
							>
								<FontAwesomeIcon :icon="faFloppyDisk" />
							</BaseButton>
						</div>
					</th>
					<th>
						<div class="cell">
							<BaseButton
								:disabled="user.name === 'admin' || user.uid === Global.user.value?.uid"
								@click="delete_user(user)"
							>
								<FontAwesomeIcon :icon="faTrashCan" />
							</BaseButton>
						</div>
					</th>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<style scoped>
	#container {
		display: flex;
		flex-direction: column;

		align-items: center;

		gap: 0.25em;
	}

	#add-user-wrapper {
		display: flex;
		flex-direction: column;

		gap: 0.5em;

		font-size: 1em;
	}

	#add-user {
		display: flex;
	}

	#user-exists-error {
		color: var(--color-error);
	}

	#add-user-inputs {
		display: flex;
		gap: 1em;
	}

	.input-wrapper {
		display: inline-flex;
		align-items: baseline;
		gap: 0.5em;
	}

	input[type="text"] {
		width: 10em;
	}

	#users {
		width: 100%;
	}

	tr.bar * {
		font-weight: 600;

		background-color: var(--color-text);
		color: var(--color-background);
	}

	tr.content:nth-of-type(2n) {
		background-color: var(--color-off-disabled);
	}

	tr.content:nth-of-type(2n + 1) {
		background-color: var(--color-off-hover);
	}

	th {
		padding: 0.25em;
	}

	th > div.cell {
		width: 100%;

		display: flex;
		align-items: center;
		justify-content: center;
	}

	th input[type="text"] {
		flex: 1;
	}
</style>
