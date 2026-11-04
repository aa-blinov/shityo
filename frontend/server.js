/**
 * Прод-сервер фронтенда.
 *
 * Отдаёт собранное приложение и проксирует /api на бэкенд: из браузера
 * запросы идут относительные, поэтому CORS не нужен и адрес бэкенда не
 * зашит в бандл.
 */
import http from 'node:http';
import { handler } from './build/handler.js';

const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? '127.0.0.1';
const backend = process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8000';

function proxyApi(req, res) {
	const upstream = http.request(
		backend + req.url,
		{ method: req.method, headers: { ...req.headers, host: new URL(backend).host } },
		(upstreamRes) => {
			res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
			upstreamRes.pipe(res);
		}
	);
	upstream.on('error', (err) => {
		res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ detail: `бэкенд недоступен: ${err.message}` }));
	});
	req.pipe(upstream);
}

const server = http.createServer((req, res) => {
	if (req.url?.startsWith('/api')) {
		proxyApi(req, res);
		return;
	}
	handler(req, res, () => {
		res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
		res.end('not found');
	});
});

server.listen(port, host, () => {
	console.log(`frontend on http://${host}:${port}, backend ${backend}`);
});
