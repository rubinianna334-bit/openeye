const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3100;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/monitor', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/monitor.html'));
});

// SSE Clients pool
let sseClients = [];

// WebSocket Server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    ws.on('message', (msg) => console.log('Received message from WS client:', msg));
    ws.on('error', (err) => console.error('WebSocket client error:', err));
    ws.on('close', () => console.log('WebSocket client disconnected'));
});

wss.on('error', (err) => {
    console.error('WebSocket Server Error:', err);
});

// Broadcast to all clients (WebSocket and SSE)
function broadcast(data) {
    const payload = JSON.stringify(data);

    // Broadcast to SSE
    sseClients.forEach(client => {
        client.write(`data: ${payload}\n\n`);
    });

    // Broadcast to WebSocket
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// Webhook endpoint
app.all('/webhook', (req, res) => {
    // Merge data from query (GET) and body (POST)
    const incomingData = { ...req.query, ...req.body };

    // Default to ping: 1 if no data is provided
    const dataToBroadcast = Object.keys(incomingData).length > 0
        ? incomingData
        : { event: 'ping', value: 1 };

    console.log(`Webhook triggered [${req.method}]:`, dataToBroadcast);

    broadcast({
        ...dataToBroadcast,
        source: `webhook (${req.method})`,
        timestamp: new Date().toISOString()
    });

    res.status(200).send('Data broadcasted');
});

// SSE endpoint
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const client = res;
    sseClients.push(client);
    console.log('SSE client connected');

    req.on('close', () => {
        console.log('SSE client disconnected');
        sseClients = sseClients.filter(c => c !== client);
    });
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
