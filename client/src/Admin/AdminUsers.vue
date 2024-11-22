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
	<div class="flex flex-col items-center gap-1">
		<h1>Users</h1>
		<div class="flex flex-col gap-2">
			<div class="text-red-600" v-if="user_exists_error">
				User with same username already exists
			</div>
			<div class="flex">
				<div class="flex gap-4">
					<span class="inline-flex items-baseline gap-2"
						><span>username:</span
						><input type="text" class="w-30" v-model="add_user_name" @keydown.enter="add_user()"
					/></span>
					<span class="inline-flex items-baseline gap-2"
						><span>password:</span
						><input
							type="text"
							class="w-30"
							v-model="add_user_password"
							@keydown.enter="add_user()"
					/></span>
				</div>
				<BaseButton @click="add_user()"><FontAwesomeIcon :icon="faPlus" /></BaseButton>
			</div>
		</div>
		<table class="w-full">
			<thead class="bg-stone-700 text-white">
				<tr>
					<th>UID</th>
					<th>Name</th>
					<th>password</th>
					<th>Admin</th>
					<th>Submit</th>
					<th>Delete</th>
				</tr>
			</thead>
			<tbody>
				<tr class="odd:bg-stone-300 even:bg-stone-400" v-for="user of users" :key="user.uid">
					<th>{{ user.uid }}</th>
					<th>{{ user.name }}</th>
					<th>
						<input
							v-model="user.password"
							class="w-full"
							:disabled="user.name === 'admin' && Global.user.value?.uid !== user.uid"
							type="text"
							placeholder="new password"
						/>
					</th>
					<th>
						<BaseSlider
							class="mx-auto"
							:disabled="user.name === 'admin' || user.uid === Global.user.value?.uid"
							v-model="user.admin"
						/>
					</th>
					<th>
						<BaseButton
							:disabled="user.name === 'admin' && Global.user.value?.uid !== user.uid"
							@click="modify_user(user)"
						>
							<FontAwesomeIcon :icon="faFloppyDisk" />
						</BaseButton>
					</th>
					<th>
						<BaseButton
							:disabled="user.name === 'admin' || user.uid === Global.user.value?.uid"
							@click="delete_user(user)"
						>
							<FontAwesomeIcon :icon="faTrashCan" />
						</BaseButton>
					</th>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<style scoped>
	th {
		padding: 0.25em;
	}

	tbody th {
		font-weight: normal;
	}
</style>
