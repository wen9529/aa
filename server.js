// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const { initializeSocketEvents } = require('./sockets/socketHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity, restrict in production
        methods: ["GET", "POST"]
    }
});

app.disable('x-powered-by');

const PORT = process.env.PORT || 3000; // Changed port for fresh start
console.log(`[SERVER] Startup. NODE_ENV: ${process.env.NODE_ENV || 'development'}, Port: ${PORT}`);

// Serve static files from 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Socket.IO event handlers
initializeSocketEvents(io);

// Optional: Route for root to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`[SERVER] Server running and listening on port ${PORT}`);
});

process.on('SIGINT', () => {
    console.log('[SERVER] Shutting down...');
    io.close(() => {
        console.log('[SERVER] Socket.IO closed.');
        server.close(() => {
            console.log('[SERVER] HTTP Server closed.');
            process.exit(0);
        });
    });
});
