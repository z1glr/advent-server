/** @type {import('tailwindcss').Config} */
export default {
	content: [
		"./src/**/*.{html,css,ts,js,vue}"
	],
	theme: {
		extend: {
			colors: {
				white: "hsl(0, 0%, 90%)"
			}
		},
	},
	plugins: [],
}

