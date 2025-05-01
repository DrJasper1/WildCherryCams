// This file is used by Render to start the application
// It's similar to your normal index.js but configured for cloud hosting

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// --- Configuration ---
const PORT = process.env.PORT || 3001;
const HOST_PASSWORD = "1"; // Your host password

// Create Express app
const app = express();

// Middleware
app.use(express.static('public'));
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize socket.io with CORS configuration
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  }
});

// Store active connections for reconnection handling
const connections = {
  host: null,
  clients: new Set(),
  waitingToConnect: []
};

// Banned IPs list (in-memory for demo purposes)
const bannedIPs = new Set();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`👋 User connected: ${socket.id} - IP: ${socket.handshake.address} - ${socket.handshake.headers['user-agent']?.includes('Mobile') ? 'Mobile' : 'Desktop'} - ${socket.handshake.headers['user-agent']?.substring(0, 60)}...`);
  
  // Immediately send user ID to client
  socket.emit('set-id', socket.id);

  // Auto-host logic: first user becomes host
  if (!connections.host) {
    console.log(`No host exists. Making ${socket.id} the host automatically.`);
    connections.host = socket.id;
    socket.emit('auth-result', { success: true });
  }

  // Check if any users are waiting to connect
  if (connections.host === socket.id) {
    socket.emit('host-status-update', 'You are the host');
    console.log(`Host ${socket.id} checking for waiting clients`);
    
    if (connections.waitingToConnect.length > 0) {
      console.log(`There are ${connections.waitingToConnect.length} clients waiting to connect`);
      
      // Connect the first waiting client to the host
      const waitingClient = connections.waitingToConnect.shift();
      connectUsers(connections.host, waitingClient);
    } else {
      console.log(`No waiting clients for host ${socket.id}`);
    }
  } else {
    // If this is a client and a host exists, connect them
    if (connections.host) {
      connectUsers(connections.host, socket.id);
    } else {
      // Add to waiting list if no host is available
      connections.waitingToConnect.push(socket.id);
      console.log(`No host available. Added ${socket.id} to waiting list.`);
      socket.emit('waiting-for-host');
    }
  }

  // Host authentication
  socket.on('auth-host', (data) => {
    if (data.password === HOST_PASSWORD) {
      connections.host = socket.id;
      socket.emit('auth-result', { success: true });
      console.log(`User ${socket.id} authenticated as host`);
    } else {
      socket.emit('auth-result', { success: false, message: 'Invalid password' });
      console.log(`Failed host authentication attempt by ${socket.id}`);
    }
  });

  // Client requests to connect to host
  socket.on('connect-to-host', () => {
    if (!connections.host) {
      socket.emit('host-status', { isHostAvailable: false });
      return;
    }
    connectUsers(connections.host, socket.id);
  });

  // Host kicks client
  socket.on('kick-client', () => {
    if (connections.host !== socket.id) {
      console.log(`Non-host ${socket.id} attempted to kick client`);
      return;
    }
    
    // Find the client connected to this host
    for (const [id1, id2] of connections.clients) {
      if (id1 === socket.id) {
        io.to(id2).emit('kicked');
        console.log(`Host ${id1} kicked client ${id2}`);
        connections.clients.delete([id1, id2]);
        break;
      }
    }
  });

  // Host bans client
  socket.on('ban-client', () => {
    if (connections.host !== socket.id) {
      console.log(`Non-host ${socket.id} attempted to ban client`);
      return;
    }
    
    // Find the client connected to this host
    for (const [id1, id2] of connections.clients) {
      if (id1 === socket.id) {
        const clientIP = io.sockets.sockets.get(id2)?.handshake.address;
        if (clientIP) {
          bannedIPs.add(clientIP);
          console.log(`Added ${clientIP} to banned list`);
        }
        io.to(id2).emit('banned');
        console.log(`Host ${id1} banned client ${id2}`);
        connections.clients.delete([id1, id2]);
        break;
      }
    }
  });

  // WebRTC signaling: offer
  socket.on('offer', (data) => {
    console.log(`Offer from ${socket.id} to ${data.target}`);
    io.to(data.target).emit('offer', {
      offer: data.offer,
      source: socket.id
    });
  });

  // WebRTC signaling: answer
  socket.on('answer', (data) => {
    console.log(`Answer from ${socket.id} to ${data.target}`);
    io.to(data.target).emit('answer', {
      answer: data.answer,
      source: socket.id
    });
  });

  // WebRTC signaling: ICE candidate
  socket.on('ice-candidate', (data) => {
    console.log(`ICE candidate from ${socket.id} to ${data.target}`);
    io.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      source: socket.id
    });
  });

  // Client disconnection handling
  socket.on('disconnect', () => {
    console.log(`👋 User disconnected: ${socket.id} (Reason: ${socket.disconnectReason || 'unknown'})`);
    
    // If the host disconnected
    if (connections.host === socket.id) {
      console.log(`Host ${socket.id} disconnected.`);
      connections.host = null;
      
      // Notify all connected clients that the host is gone
      for (const [id1, id2] of connections.clients) {
        if (id1 === socket.id) {
          io.to(id2).emit('host-disconnected');
          connections.clients.delete([id1, id2]);
        }
      }
    } else {
      // If a client disconnected, notify their partner
      for (const [id1, id2] of connections.clients) {
        if (id2 === socket.id) {
          io.to(id1).emit('client-disconnected', { partnerId: id2 });
          console.log(`Notified host ${id1} that client ${id2} disconnected`);
          connections.clients.delete([id1, id2]);
          break;
        }
      }
    }
    
    // Remove from waiting list if they were waiting
    const waitingIndex = connections.waitingToConnect.indexOf(socket.id);
    if (waitingIndex !== -1) {
      connections.waitingToConnect.splice(waitingIndex, 1);
      console.log(`Removed disconnected user ${socket.id} from waiting list`);
    }
    
    // Log the current system state
    console.log('=== SYSTEM STATE ===');
    console.log(`Waiting users: ${connections.waitingToConnect.length}`);
    console.log(`Connected pairs: ${connections.clients.size}`);
    console.log(`Waiting: [${connections.waitingToConnect.join(', ')}]`);
    console.log(`Active connections: [${[...connections.clients].map(pair => pair.join(' -> ')).join(', ')}]`);
    console.log('====================');
  });
});

// Helper function to connect two users
function connectUsers(hostId, clientId) {
  if (!io.sockets.sockets.has(hostId) || !io.sockets.sockets.has(clientId)) {
    console.log(`Cannot connect users: one or both users not found (Host: ${hostId}, Client: ${clientId})`);
    return;
  }
  
  // Check if client IP is banned
  const clientIP = io.sockets.sockets.get(clientId)?.handshake.address;
  if (bannedIPs.has(clientIP)) {
    console.log(`Banned IP ${clientIP} (${clientId}) attempted to connect`);
    io.to(clientId).emit('banned');
    return;
  }
  
  console.log(`Connecting host ${hostId} with client ${clientId}`);
  
  // Store the connection
  connections.clients.add([hostId, clientId]);
  
  // Notify both users about the connection
  io.to(hostId).emit('client-connected', { partnerId: clientId });
  io.to(clientId).emit('connected-to-host', { hostId: hostId });
}

// Start the server
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`📝 The first browser to connect will automatically become the host`);
});
