import request from 'supertest';
import WebSocket from 'ws';
import { createServer } from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';

function createAppAndServer() {
    const app = express();

    app.get('/', (_, res) => {
        res.status(200).json({ code: 200, message: 'Hello, World!' });
    });

    const server = createServer(app);
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        ws.on('message', (message) => {
            ws.send(`Echo: ${message}`);
        });
    });

    return { app, server, wss };
}

describe('HTTP Server', () => {
    let server: ReturnType<typeof createServer>;

    beforeAll(() => {
        const result = createAppAndServer();
        server = result.server;
    });

    afterAll((done) => {
        server.close(done);
    });

    it('should respond with user a json response', async () => {
        const response = await request(server).get('/');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ code: 200, message: 'Hello, World!' });
    });
});

describe('WebSocket Server', () => {
    let server: ReturnType<typeof createServer>;
    let wss: WebSocketServer;

    beforeAll((done) => {
        const result = createAppAndServer();
        server = result.server;
        wss = result.wss;
        server.listen(3000, done);
    });

    afterAll((done) => {
        wss.close();
        server.close(done);
    });

    it('should echo the message', (done) => {
        const ws = new WebSocket('ws://localhost:3000');

        ws.on('open', () => {
            ws.send('Hello, World!');
        });

        ws.on('message', (message) => {
            expect(message).toBe('Echo: Hello, World!');
            ws.close();
            done();
        });
    });
});