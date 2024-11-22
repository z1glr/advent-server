/* eslint-disable @typescript-eslint/naming-convention */
/** @type {import('tailwindcss').Config} */

export default {
	content: ["./src/**/*.{html,css,ts,js,vue}"],
	theme: {
		extend: {
			colors: {
				white: "hsl(0, 0%, 90%)",
				red: {
					50: "#fff3f1",
					100: "#ffe3df",
					200: "#ffccc5",
					300: "#ffa89d",
					400: "#ff7664",
					500: "#ff4c34",
					600: "#ee3820",
					700: "#c8230d",
					800: "#a5200f",
					900: "#882214",
					950: "#4b0c04"
				},
				teal: {
					50: "#effefc",
					100: "#c7fff6",
					200: "#90ffed",
					300: "#51f7e4",
					400: "#1de4d3",
					500: "#04c8ba",
					600: "#00a39b",
					700: "#05807b",
					800: "#0a6563",
					900: "#0d5452",
					950: "#003233"
				}
			}
		}
	},
	plugins: []
};
