import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const backend = env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8000';
	const proxy = {
		'/api': {
			target: backend,
			changeOrigin: true
		}
	};

	return {
		plugins: [sveltekit()],
		server: {
			port: 5173,
			strictPort: false,
			proxy
		},
		preview: {
			port: 5173,
			proxy
		}
	};
});
