import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
	root: "src",
	server: {
		proxy: {
			"/api": {
				target: "http://172.25.220.64:61016",
				// target: "http://localhost:61016",
				changeOrigin: true
			},
		},
		host: true
	},
	plugins: [
		vue(),
	],
	build: {
	outDir: "../../dist/client",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				index: resolve(__dirname, "src/index.html"),
				admin: resolve(__dirname, "src/admin.html"),
				About: resolve(__dirname, "src/About.html"),
				"legal/Impressum": resolve(__dirname, "src/legal/Impressum.html"),
				"legal/Datenschutz": resolve(__dirname, "src/legal/Datenschutz.html")
			}
		}
	},
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url))
		}
	}
})
