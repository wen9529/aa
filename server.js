// server.js

// -----------------------------------------------------------------------------
// 1. Load environment variables from .env file AT THE VERY TOP
//    This makes process.env variables available throughout the application.
// -----------------------------------------------------------------------------
require('dotenv').config();

// -----------------------------------------------------------------------------
// 2. Require necessary modules
// -----------------------------------------------------------------------------
const express = require('express');
const http = require('http');
const { Server } = require("socket.io"); // Correct import for Socket.IO v3+
const path = require('path');
const { initializeSocketEvents } = require('./sockets/socketHandler'); // 确保路径正确

// -----------------------------------------------------------------------------
// 3. Initialize Express app, HTTP server, and Socket.IO
// -----------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        // For development, "*" is fine. For production, restrict to your actual frontend domain.
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"]
    }
});

// Minor security improvement
app.disable('x-powered-by');

// -----------------------------------------------------------------------------
// 4. Define Port
//    - process.env.PORT is typically set by hosting platforms (like Serv00, Heroku, etc.)
//    - If not set by platform, it will try to use PORT from .env file (loaded by dotenv)
//    - If neither is set, it falls back to 3001 (or any default you prefer)
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3001; // Default to 3001 if not specified elsewhere

console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`[SERVER] Attempting to listen on port: ${PORT}`);
if (process.env.NODE_ENV === 'development' && process.env.PORT && process.env.PORT !== String(PORT)) {
    console.warn(`[SERVER] Warning: process.env.PORT (${process.env.PORT}) from system/platform is overriding .env or default value for PORT.`);
}


// -----------------------------------------------------------------------------
// 5. Middleware
// -----------------------------------------------------------------------------
// Serve static files (HTML, CSS, client-side JS, images) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// -----------------------------------------------------------------------------
// 6. Initialize Socket.IO event handlers
//    Pass the 'io' instance to your socket handler module.
// -----------------------------------------------------------------------------
initializeSocketEvents(io);

// -----------------------------------------------------------------------------
// 7. Optional: A root route to serve your main HTML file
//    This is good practice if users directly access the root domain.
// -----------------------------------------------------------------------------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -----------------------------------------------------------------------------
// 8. Start the HTTP server
//    Listen on 0.0.0.0 to accept connections on all available network interfaces,
//    which is important for Docker, PaaS, and other hosting environments.
// -----------------------------------------------------------------------------
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Server running and listening on http://0.0.0.0:${PORT}`);
    if (process.env.NODE_ENV === 'production') {
         console.log(`[SERVER] Application is in production mode. Access via your configured domain.`);
    } else {
         console.log(`[SERVER] Access locally at http://localhost:${PORT}`);
    }
});

// -----------------------------------------------------------------------------
// 9. Graceful shutdown handling (optional but good for production)
// -----------------------------------------------------------------------------
function gracefulShutdown(signal) {
    console.log(`[SERVER] Received ${signal}. Starting graceful shutdown...`);
    io.close(() => {
        console.log('[SERVER] Socket.IO server closed.');
        server.close(() => {
            console.log('[SERVER] HTTP server closed.');
            // Here you might close database connections or other resources
            console.log('[SERVER] Shutdown complete.');
            process.exit(0);
        });
    });

    // Force shutdown if graceful shutdown takes too long
    setTimeout(() => {
        console.error('[SERVER] Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 10000); // 10 seconds timeout
}

process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // kill command

process.on('uncaughtException', (error) => {
    console.error('[SERVER] Uncaught Exception:', error);
    // It's often recommended to exit after an uncaught exception,
    // as the application might be in an unstable state.
    // process.exit(1); // Consider if you want to auto-exit or just log
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[SERVER] Unhandled Rejection at:', promise, 'reason:', reason);
    // process.exit(1); // Consider if you want to auto-exit
});
