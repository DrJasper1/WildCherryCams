const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Host authentication settings
const HOST_PASSWORD = '1'; // Simple password for testing

const localtunnel = require('localtunnel');
let ngrok;
try {
  ngrok = require('ngrok');
} catch (e) {
  console.log('Ngrok not available, will try localtunnel as fallback');
}
// fs is already required above

// --- Configuration ---
// HOST_PASSWORD is defined at the top of the file
const PORT = process.env.PORT || 3001; // Allow dynamic port assignment

// Create Express app
const app = express();
const server = http.createServer(app);

// Configure Socket.IO with ultra-reliable settings for localhost testing
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
  },
  pingTimeout: 30000,
  pingInterval: 10000,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  maxHttpBufferSize: 1e8 // 100 MB
});

// Enable CORS with full permissions
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Middleware to set ngrok-skip-browser-warning header on all responses
app.use((req, res, next) => {
  // Add custom User-Agent check headers to bypass ngrok warning
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Create a favicon.ico to prevent 404 errors
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

// Add diagnostic endpoints
app.get('/healthcheck', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount,
    uptime: process.uptime()
  });
});

app.get('/debug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'debug.html'));
});

// Middleware to log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${req.headers['user-agent']}`);
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Server error occurred',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Simple connection management
let waitingUsers = [];
const activeConnections = new Map();
const userDevices = new Map(); // Track device info for debugging

// --- Host/Client Management ---
let currentHostId = null;
let connectedClientId = null; 
const bannedIPs = new Set();

// Debug function to print system state
function printSystemState() {
  console.log('=== SYSTEM STATE ===');
  console.log(`Waiting users: ${waitingUsers.length}`);
  console.log(`Connected pairs: ${activeConnections.size / 2}`);
  console.log('Waiting:', waitingUsers);
  console.log('Active connections:', Array.from(activeConnections.entries()));
  console.log('====================');
}

// Reset all connections (for debugging)
app.get('/reset', (req, res) => {
  waitingUsers = [];
  activeConnections.clear();
  userDevices.clear();
  // Reset host/client state
  currentHostId = null;
  connectedClientId = null;
  bannedIPs.clear(); // Optionally clear bans on reset

  io.emit('server-reset');
  res.send('Server reset complete - all connections cleared');
});

// Helper function to connect client to host
function connectClientToHost(clientId) {
  if (!currentHostId || connectedClientId) {
    console.log(`Cannot connect client ${clientId}: No host available or host already busy.`);
    // Optionally notify client they need to wait
    io.to(clientId).emit('waiting-for-host');
    return;
  }

  connectedClientId = clientId;
  activeConnections.set(currentHostId, clientId); // Host -> Client
  activeConnections.set(clientId, currentHostId); // Client -> Host

  // Notify both
  io.to(currentHostId).emit('client-connected', { partnerId: clientId });
  io.to(clientId).emit('connected-to-host', { partnerId: currentHostId });

  console.log(`Connected client ${clientId} to host ${currentHostId}`);
  printSystemState(); // Log state after connection
}

// Socket.io connection handler
io.on('connection', (socket) => {
  const userIP = socket.handshake.address; // Get user's IP
  const userAgent = socket.handshake.headers['user-agent'] || 'Unknown';
  const isMobile = /mobile/i.test(userAgent);

  console.log(`Attempting connection from IP: ${userIP}`);

  // --- Ban Check ---
  if (bannedIPs.has(userIP)) {
    console.log(`Rejected banned IP: ${userIP}`);
    socket.emit('banned', { reason: 'Your IP address has been banned.' });
    socket.disconnect(true);
    return;
  }
  
  console.log(`User connected: ${socket.id} - IP: ${userIP} - ${isMobile ? 'Mobile' : 'Desktop'} - ${userAgent.substring(0, 50)}...`);
  userDevices.set(socket.id, { userAgent: userAgent, isMobile: isMobile, joinTime: Date.now(), ip: userIP });
  
  // Send initial connection acknowledgement with extra info
  socket.emit('connection-established', { 
    socketId: socket.id,
    timestamp: Date.now(),
    waitingUsers: waitingUsers.length,
    serverTime: new Date().toISOString()
  });
  
  // --- Host/Client Logic ---
  if (currentHostId) {
    // A host already exists
    socket.emit('host-status', { isHostAvailable: true });
    
    if (!connectedClientId) {
      // Host is available and free, connect this user as client
      console.log(`Host ${currentHostId} is free. Connecting new user ${socket.id} as client.`);
      connectClientToHost(socket.id);
    } else {
      // Host exists but is busy
      console.log(`Host ${currentHostId} is busy with ${connectedClientId}. User ${socket.id} must wait.`);
      socket.emit('host-busy'); 
    }
  } else {
    // No host exists yet - but now we'll just connect as regular user
    console.log(`No host exists. User ${socket.id} connected as regular user.`);
    // We won't auto-assign host status anymore
  }
  
  // Handle client requesting connection to host
  socket.on('connect-to-host', () => {
    console.log(`User ${socket.id} requesting connection to host`);
    
    if (!currentHostId) {
      console.log(`Cannot connect - no host available`);
      socket.emit('host-status', { isHostAvailable: false });
      return;
    }
    
    if (connectedClientId) {
      if (connectedClientId === socket.id) {
        console.log(`User ${socket.id} already connected to host`);
        return;
      }
      console.log(`Cannot connect ${socket.id} - host busy with ${connectedClientId}`);
      socket.emit('host-busy');
      return;
    }
    
    // Connect this client to the host
    console.log(`Connecting ${socket.id} to host ${currentHostId} upon request`);
    connectClientToHost(socket.id);
  });
  
  // Handle host password verification
  socket.on('verify-host-password', (data) => {
    console.log(`User ${socket.id} attempting to become host with password`);    
    if (data.password === HOST_PASSWORD) {
      console.log(`User ${socket.id} authenticated as host successfully`);
      
      // If there's already a host, reject this request
      if (currentHostId) {
        console.log(`Host position already filled by ${currentHostId}. Rejecting request from ${socket.id}`);
        socket.emit('host-auth-response', { success: false, message: 'Another user is already host' });
        return;
      }
      
      // Make this user the host
      currentHostId = socket.id;
      socket.emit('host-auth-response', { success: true, message: 'You are now the host' });
      socket.broadcast.emit('host-status', { isHostAvailable: true });
    } else {
      console.log(`User ${socket.id} provided incorrect host password`);
      socket.emit('host-auth-response', { success: false, message: 'Incorrect password' });
    }
  });
  
  // Handle host checking for waiting clients
  socket.on('check-waiting-clients', () => {
    // Only hosts should call this
    if (socket.id !== currentHostId) {
      console.log(`Non-host ${socket.id} tried to check for waiting clients`);
      return;
    }
    
    console.log(`Host ${socket.id} checking for waiting clients`);
    
    // If we already have a connected client, do nothing
    if (connectedClientId) {
      console.log(`Host already has client ${connectedClientId} connected`);
      return;
    }
    
    // Check for any connected sockets that aren't the host
    const clients = Array.from(io.sockets.sockets.keys())
      .filter(id => id !== currentHostId);
    
    if (clients.length > 0) {
      // Connect the first available client
      const clientToConnect = clients[0];
      console.log(`Host found waiting client ${clientToConnect}. Connecting...`);
      connectClientToHost(clientToConnect);
    } else {
      console.log(`No waiting clients for host ${socket.id}`);
    }
  });
  
  // Regularly ping clients to verify connection is still active
  const pingInterval = setInterval(() => {
    if (socket.connected) {
      socket.emit('ping', { timestamp: Date.now() });
    } else {
      clearInterval(pingInterval);
    }
  }, 10000);
  
  // Handle offers (one browser initiating a connection) with enhanced SDP handling
  socket.on('offer', (data) => {
    try {
      const { offer, to } = data;
      const partner = activeConnections.get(socket.id);
      console.log(`🔶 OFFER from ${socket.id} to ${to || partner || 'unknown'}`);
      
      // Get partner ID - should only be host/client
      // const partner = to || activeConnections.get(socket.id);

      if (!partner) {
        console.log(`⚠️ No partner specified or found for ${socket.id}'s offer`);
        socket.emit('no-partner-available');
        return;
      }

      // Ensure partner is still connected
      if (!io.sockets.sockets.has(partner)) {
          console.log(`⚠️ Partner ${partner} for offer from ${socket.id} is disconnected.`);
          socket.emit('partner-disconnected', { reason: 'Offer target disconnected' });
          // Clean up potentially stale connection
          if (activeConnections.has(socket.id)) activeConnections.delete(socket.id);
          if (activeConnections.has(partner)) activeConnections.delete(partner);
          if (socket.id === currentHostId) connectedClientId = null;
          if (socket.id === connectedClientId) connectedClientId = null;
          return;
      }
      
      // Process the SDP to ensure cross-browser compatibility
      let processedOffer = offer;
      
      if (processedOffer && processedOffer.sdp) {
        // Modify SDP for better cross-browser compatibility
        let sdp = processedOffer.sdp;
        
        // Ensure audio has high priority
        sdp = sdp.replace(/(m=audio.*\r\n)/g, '$1a=mid:0\r\n');
        
        // Ensure proper format for video
        sdp = sdp.replace(/(m=video.*\r\n)/g, '$1a=mid:1\r\n');
        
        // Force UDP candidates to be prioritized over TCP (better for media)
        sdp = sdp.replace(/(a=candidate.*UDP.*\r\n)/g, 'a=candidate-priority:1.0\r\n$1');
        
        // Ensure proper connection establishment
        if (!sdp.includes('a=setup:actpass')) {
          sdp = sdp.replace(/(m=audio.*\r\n)/g, '$1a=setup:actpass\r\n');
        }
        
        // Apply the modified SDP
        processedOffer.sdp = sdp;
        console.log('SDP offer processed for cross-browser compatibility');
      }
      
      // Relay offer to the specific partner
      io.to(partner).emit('offer', { 
          offer: processedOffer, 
          from: socket.id 
      });
      
      console.log(`Relayed offer from ${socket.id} to ${partner}`);
      // Log SDP for debugging
      // console.log('Processed Offer SDP:', JSON.stringify(processedOffer.sdp));

    } catch (error) {
      console.error(`❌ Error processing offer from ${socket.id}:`, error);
      socket.emit('error', { type: 'offer-processing', message: error.message });
    }
  });
  
  // Handle answers (response to an offer)
  socket.on('answer', (data) => {
    try {
      const { answer, to } = data;
      const partner = activeConnections.get(socket.id);
      console.log(`🔷 ANSWER from ${socket.id} to ${to || partner || 'unknown'}`);
      
      // Get partner ID - should only be host/client
      // const partner = to || activeConnections.get(socket.id);

      if (!partner) {
        console.log(`⚠️ No partner specified or found for ${socket.id}'s answer`);
        return; // Don't emit error, just ignore if no recipient
      }

      // Ensure partner is still connected
      if (!io.sockets.sockets.has(partner)) {
          console.log(`⚠️ Partner ${partner} for answer from ${socket.id} is disconnected.`);
          // No need to notify sender, they will realize via ICE state
          return;
      }
      
      // Process SDP for compatibility
      let processedAnswer = answer;
      
      if (processedAnswer && processedAnswer.sdp) {
        // Enhance SDP answer for better cross-browser compatibility
        let sdp = processedAnswer.sdp;
        
        // Ensure audio has high priority
        sdp = sdp.replace(/(m=audio.*\r\n)/g, '$1a=mid:0\r\n');
        
        // Ensure proper format for video
        sdp = sdp.replace(/(m=video.*\r\n)/g, '$1a=mid:1\r\n');
        
        // Force UDP candidates to be prioritized over TCP (better for media)
        sdp = sdp.replace(/(a=candidate.*UDP.*\r\n)/g, 'a=candidate-priority:1.0\r\n$1');
        
        // Ensure connection establishment properly
        if (!sdp.includes('a=setup:active')) {
          sdp = sdp.replace(/(m=audio.*\r\n)/g, '$1a=setup:active\r\n');
        }
        
        // Apply the modified SDP
        processedAnswer.sdp = sdp;
        console.log('SDP answer processed for cross-browser compatibility');
      }
      
      // Relay answer to the specific partner
      io.to(partner).emit('answer', { 
          answer: processedAnswer, 
          from: socket.id 
      });
      console.log(`Relayed answer from ${socket.id} to ${partner}`);
      // Log SDP for debugging
      // console.log('Processed Answer SDP:', JSON.stringify(processedAnswer.sdp));

    } catch (error) {
      console.error(`❌ Error processing answer from ${socket.id}:`, error);
      socket.emit('error', { type: 'answer-processing', message: error.message });
    }
  });
  
  // Handle ICE candidates (network path negotiation)
  socket.on('ice-candidate', (data) => {
    try {
      const { candidate, to } = data;
      const partner = activeConnections.get(socket.id);
      // console.log(`🧊 ICE Candidate from ${socket.id} for ${to || partner || 'unknown'}`); // Too verbose
      
      // Get partner ID - should only be host/client
      // const partner = to || activeConnections.get(socket.id);

      if (!partner) {
        // console.log(`⚠️ No partner specified or found for ${socket.id}'s ICE candidate`); // Too verbose
        return; 
      }

      // Ensure partner is still connected
      if (!io.sockets.sockets.has(partner)) {
          // console.log(`⚠️ Partner ${partner} for ICE candidate from ${socket.id} is disconnected.`); // Too verbose
          return;
      }

      // Relay ICE candidate to the specific partner
      io.to(partner).emit('ice-candidate', { 
          candidate: candidate, 
          from: socket.id 
      });
      // console.log(`Relayed ICE candidate from ${socket.id} to ${partner}`); // Too verbose

    } catch (error) {
      console.error(`❌ Error processing ICE candidate from ${socket.id}:`, error);
      // Don't flood with errors, maybe log less critical
    }
  });

  // Host authentication handler - v1.2.5
  socket.on('authenticate-host', (data) => {
    try {
      const { password } = data;
      
      console.log(`\n==== AUTH ATTEMPT v1.2.5 ====`);
      console.log(`FROM: ${socket.id}`);
      console.log(`PASSWORD MATCH: ${password === HOST_PASSWORD}`);
      console.log(`CURRENT HOST: ${currentHostId || 'None'}`);
      
      // Check if this socket is already the host
      if (currentHostId === socket.id) {
        console.log(`ℹ️ Re-authentication attempt from current host ${socket.id}`);
        socket.emit('auth-result', { 
          success: true, 
          hostId: currentHostId,
          message: 'Already authenticated as host.',
          alreadyAuthenticated: true
        });
        console.log(`Re-authentication confirmation sent to ${socket.id}`);
        return;
      }
      
      // Check if another socket is already the host
      if (currentHostId && currentHostId !== socket.id) {
        console.log(`⚠️ Authentication attempt while another host exists: ${currentHostId}`);
        
        // Check if the existing host is still connected
        if (io.sockets.sockets.has(currentHostId)) {
          console.log(`⚠️ Existing host ${currentHostId} is still connected, rejecting new host`);
          socket.emit('auth-result', { 
            success: false, 
            message: 'Another host is already active. Try again later.'
          });
          return;
        } else {
          console.log(`ℹ️ Previous host ${currentHostId} is disconnected, allowing new host`);
          // Previous host is gone, allow this one to take over
        }
      }
      
      if (password === HOST_PASSWORD) {
        // Set this client as the host
        currentHostId = socket.id;
        console.log(`✅ Authentication successful for ${socket.id}`);
        
        // Notify client of success
        socket.emit('auth-result', { success: true, hostId: currentHostId });
        console.log(`Authentication success sent to ${socket.id}`);
        
        // Notify others that host is now available
        socket.broadcast.emit('host-status', { isHostAvailable: true });
        
        if (!connectedClientId) {
          console.log(`Host ${currentHostId} is now available. Waiting for client.`);
        }
      } else {
        console.log(`❌ Authentication failed for ${socket.id} - Incorrect password`);
        socket.emit('auth-result', { success: false, message: 'Incorrect password.' });
        console.log(`Authentication failure sent to ${socket.id}`);
      }
      
      console.log(`==== END AUTH ATTEMPT ====\n`);
    } catch (error) {
      console.error(`❌ Error in host authentication:`, error);
      socket.emit('auth-result', { success: false, message: 'Server error during authentication.' });
    }
  });

  // --- Echo Test for v1.2.4 --- 
  socket.on('echo-test', (data) => {
    console.log(`\n==== ECHO TEST v1.2.4 ====`);
    console.log(`FROM: ${socket.id}`);
    console.log(`DATA: ${JSON.stringify(data)}`);
    console.log(`SOCKET STATE: ${socket.connected ? 'Connected' : 'Disconnected'}`);
    console.log(`==== END ECHO TEST ====\n`);
    
    // Send response back to client
    socket.emit('echo-response', {
      received: true,
      originalMessage: data ? data.message : 'No message',
      serverTime: new Date().toISOString(),
      version: 'v1.2.4'
    });
  });
  
  // --- Get Waiting Clients - v1.2.4 ---
  socket.on('get-waiting-clients', () => {
    console.log(`\n==== GET WAITING CLIENTS v1.2.4 ====`);
    console.log(`FROM HOST: ${socket.id}`);
    console.log(`WAITING CLIENTS: ${waitingUsers.length}`);
    
    // Only respond if this is the host
    if (socket.id === currentHostId) {
      socket.emit('waiting-clients-list', {
        clientCount: waitingUsers.length,
        clients: waitingUsers
      });
      console.log(`Sent waiting clients list to host`);
    } else {
      console.log(`Request rejected - not from host`);
    }
    console.log(`==== END GET WAITING CLIENTS ====\n`);
  });
  
  // --- Host Ready Event - v1.2.4 ---
  socket.on('host-ready', () => {
    console.log(`\n==== HOST READY v1.2.4 ====`);
    console.log(`FROM HOST: ${socket.id}`);
    
    // Verify this is the host
    if (socket.id !== currentHostId) {
      console.log(`Ignored host-ready from non-host: ${socket.id}`);
      return;
    }
    
    // Broadcast host availability to all clients
    socket.broadcast.emit('host-available', { hostId: currentHostId });
    console.log(`Broadcast host availability to all clients`);
    
    // If there are waiting users, connect the first one
    if (waitingUsers.length > 0 && !connectedClientId) {
      const clientToConnect = waitingUsers.shift();
      console.log(`Connecting waiting client ${clientToConnect} to host ${currentHostId}`);
      
      // Connect this client to the host
      if (io.sockets.sockets.has(clientToConnect)) {
        // Set up connection between host and client
        activeConnections.set(currentHostId, clientToConnect);
        activeConnections.set(clientToConnect, currentHostId);
        connectedClientId = clientToConnect;
        
        // Notify both parties
        io.to(currentHostId).emit('client-connected', { clientId: clientToConnect });
        io.to(clientToConnect).emit('connected-to-host', { hostId: currentHostId });
        
        console.log(`Successfully connected client ${clientToConnect} to host ${currentHostId}`);
      } else {
        console.log(`Failed to connect - client ${clientToConnect} socket not found`);
        // Remove this client from waiting list as they're no longer connected
        const idx = waitingUsers.indexOf(clientToConnect);
        if (idx > -1) waitingUsers.splice(idx, 1);
      }
    } else {
      console.log(`No waiting clients to connect`);
    }
    console.log(`==== END HOST READY ====\n`);
  });

  // --- Host Actions --- 
  socket.on('kick-user', (data) => {
    try {
      if (socket.id !== currentHostId) {
        console.log(`⚠️ Non-host ${socket.id} attempted to kick.`);
        return; // Ignore non-host requests
      }
      
      const clientIdToKick = connectedClientId; // Kick the currently connected client
      if (!clientIdToKick || !io.sockets.sockets.has(clientIdToKick)) {
        console.log(`Host ${socket.id} tried to kick, but no client ${clientIdToKick} found or connected.`);
        socket.emit('action-result', { action: 'kick', success: false, message: 'No client connected to kick.' });
        return;
      }

      console.log(`Host ${currentHostId} is kicking client ${clientIdToKick}`);
      io.to(clientIdToKick).emit('kicked', { reason: 'You have been kicked by the host.' });
      io.sockets.sockets.get(clientIdToKick)?.disconnect(true); // Force disconnect

      // Clean up state
      activeConnections.delete(currentHostId);
      activeConnections.delete(clientIdToKick);
      connectedClientId = null;
      
      socket.emit('action-result', { action: 'kick', success: true, kickedId: clientIdToKick });
      printSystemState();
    } catch (error) {
      console.error(`❌ Error kicking user by host ${socket.id}:`, error);
       socket.emit('action-result', { action: 'kick', success: false, message: 'Server error during kick.' });
    }
  });

  socket.on('ban-user', (data) => {
    try {
      if (socket.id !== currentHostId) {
        console.log(`⚠️ Non-host ${socket.id} attempted to ban.`);
        return; // Ignore non-host requests
      }

      const clientIdToBan = connectedClientId; 
      if (!clientIdToBan || !io.sockets.sockets.has(clientIdToBan)) {
        console.log(`Host ${socket.id} tried to ban, but no client ${clientIdToBan} found or connected.`);
         socket.emit('action-result', { action: 'ban', success: false, message: 'No client connected to ban.' });
        return;
      }

      const clientSocket = io.sockets.sockets.get(clientIdToBan);
      const clientIP = clientSocket?.handshake.address;

      if (!clientIP) {
        console.log(`⚠️ Could not get IP for client ${clientIdToBan} to ban.`);
         socket.emit('action-result', { action: 'ban', success: false, message: 'Could not retrieve client IP.' });
        return;
      }

      console.log(`Host ${currentHostId} is banning client ${clientIdToBan} (IP: ${clientIP})`);
      bannedIPs.add(clientIP);
      io.to(clientIdToBan).emit('banned', { reason: 'You have been banned by the host.' });
      clientSocket?.disconnect(true); // Force disconnect

      // Clean up state
      activeConnections.delete(currentHostId);
      activeConnections.delete(clientIdToBan);
      connectedClientId = null;

      console.log('Current Ban List:', Array.from(bannedIPs));
      socket.emit('action-result', { action: 'ban', success: true, bannedId: clientIdToBan, bannedIp: clientIP });
      printSystemState();
    } catch (error) {
      console.error(`❌ Error banning user by host ${socket.id}:`, error);
       socket.emit('action-result', { action: 'ban', success: false, message: 'Server error during ban.' });
    }
  });

  // Handle RTC state changes (optional logging)
  socket.on('rtc-state-change', (data) => {
    try {
      const partner = activeConnections.get(socket.id);
      // Store state for debugging
      userDevices.set(socket.id, { 
        ...userDevices.get(socket.id), 
        rtcState: data.state,
        iceState: data.iceState,
        lastUpdate: Date.now() 
      });
      
      // Forward to partner if relevant
      if (partner && io.sockets.sockets.has(partner) && data.notify) {
        io.to(partner).emit('partner-rtc-state', {
          state: data.state,
          iceState: data.iceState,
          from: socket.id
        });
      }
      
      // Auto-reconnect logic
      if (data.state === 'failed' && partner && io.sockets.sockets.has(partner)) {
        console.log(`🔄 Triggering automatic reconnection for ${socket.id} and ${partner}`);
        
        // Tell both sides to try reconnecting
        io.to(socket.id).emit('reconnect-rtc', { partnerId: partner });
        io.to(partner).emit('reconnect-rtc', { partnerId: socket.id });          
      }
    } catch (error) {
      console.error('❌ Error handling connection status update:', error);
    }
  });
  
  // Handle diagnostic request for connection monitoring
  socket.on('diagnostic', (data) => {
    try {
      const partner = activeConnections.get(socket.id);
      const response = {
        yourId: socket.id,
        partnerId: partner || 'none',
        partnerConnected: partner && io.sockets.sockets.has(partner),
        waitingQueueLength: waitingUsers.length,
        inWaitingQueue: waitingUsers.includes(socket.id),
        activePairs: activeConnections.size / 2,
        yourDevice: userDevices.get(socket.id) || {},
        timestamp: Date.now(),
        serverTime: new Date().toISOString()
      };
      
      socket.emit('diagnostic-result', response);
      console.log(`Diagnostic info sent to ${socket.id}`);
      
    } catch (error) {
      console.error('❌ Error sending diagnostic info:', error);
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', (reason) => {
    try {
      console.log(`👋 User disconnected: ${socket.id} (Reason: ${reason})`);
      userDevices.delete(socket.id);

      // --- Host/Client Disconnect Logic ---
      if (socket.id === currentHostId) {
        console.log(`Host ${currentHostId} disconnected.`);
        currentHostId = null;
        const clientToNotify = connectedClientId;
        activeConnections.delete(socket.id); // Remove host's entry
        if (clientToNotify) {
          activeConnections.delete(clientToNotify); // Remove client's entry
          console.log(`Notifying client ${clientToNotify} about host disconnection.`);
          io.to(clientToNotify).emit('host-disconnected');
          connectedClientId = null; // Clear client connection
        }
         // Notify all potential waiters that host is gone
         io.emit('host-status', { isHostAvailable: false });
      } else if (socket.id === connectedClientId) {
        console.log(`Client ${connectedClientId} disconnected from host ${currentHostId}.`);
        const hostToNotify = currentHostId;
        activeConnections.delete(socket.id); // Remove client's entry
        if (hostToNotify) {
          activeConnections.delete(hostToNotify); // Remove host's entry
           console.log(`Notifying host ${hostToNotify} about client disconnection.`);
          io.to(hostToNotify).emit('client-disconnected');
        }
        connectedClientId = null;
      } else {
        // User wasn't host or connected client, maybe was waiting?
        // Remove from old waiting list if present (should be empty now)
        const index = waitingUsers.indexOf(socket.id);
        if (index !== -1) {
          waitingUsers.splice(index, 1);
        }
        console.log(`User ${socket.id} (not host or connected client) disconnected.`);
      }

      printSystemState(); // Log state after disconnect

    } catch (error) {
      console.error(`❌ Error during disconnect for ${socket.id}:`, error);
    }
  });

  // Handle pong responses for connection verification
  socket.on('pong', (data) => {
    try {
      console.log(`📣 Pong received from ${socket.id}`);
      // Update last ping timestamp
      userDevices.set(socket.id, { 
        ...userDevices.get(socket.id), 
        lastPing: Date.now() 
      });
    } catch (error) {
      console.error('❌ Error handling pong:', error);
    }
  });
});

// Create a simple debug endpoint to monitor all users
app.get('/debug/users', (req, res) => {
  res.json({
    waitingUsers: waitingUsers,
    activeConnections: Object.fromEntries(activeConnections),
    connections: io.engine.clientsCount,
    userDevices: Object.fromEntries(userDevices)
  });
});

// Create a favicon.ico file
fs.writeFileSync(
  path.join(__dirname, 'public', 'favicon.ico'), 
  Buffer.from('AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAABILAAASCwAAAAAAAAAAAAAAAAAAAAAAADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyAP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////ADIyMgAyMjIAMjIyADIyMgD///8AMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIA////ADIyMgAyMjIAMjIyADIyMgAyMjIA////ADIyMgAyMjIAMjIyAP///wD///8A////ADIyMgAyMjIA////ADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyAP///wAyMjIAMjIyAP///wAyMjIA////AP///wAyMjIA////ADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgD///8AMjIyAP///wAyMjIA////ADIyMgD///8A////ADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIA////ADIyMgD///8AMjIyAP///wD///8AMjIyAP///wAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyAP///wD///8A////ADIyMgD///8AMjIyAP///wD///8AMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgD///8AMjIyAP///wAyMjIAMjIyADIyMgD///8AMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIA////ADIyMgD///8A////AP///wD///8A////ADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyAP///wD///8AMjIyADIyMgAyMjIAMjIyAP///wAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgD///8AMjIyADIyMgAyMjIAMjIyADIyMgD///8AMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIA////ADIyMgAyMjIAMjIyADIyMgD///8AMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyAP///wD///8A////AP///wD///8AMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyADIyMgAyMjIAMjIyAA==', 'base64')
);

// Create a debug HTML file
fs.writeFileSync(
  path.join(__dirname, 'public', 'debug.html'),
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Video Chat Debug</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #f0f0f0; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    button { padding: 8px 16px; margin: 5px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #45a049; }
    pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Video Chat Debug Panel</h1>
    <div>
      <button id="refreshBtn">Refresh Data</button>
      <button id="resetBtn">Reset All Connections</button>
    </div>
    <h2>System Status</h2>
    <pre id="status">Loading...</pre>
    
    <h2>Connected Users</h2>
    <pre id="users">Loading...</pre>
    
    <h2>Actions</h2>
    <div>
      <input type="text" id="user1" placeholder="User ID 1" />
      <input type="text" id="user2" placeholder="User ID 2" />
      <button id="pairBtn">Force Pair Users</button>
    </div>
  </div>

  <script>
    const refreshBtn = document.getElementById('refreshBtn');
    const resetBtn = document.getElementById('resetBtn');
    const pairBtn = document.getElementById('pairBtn');
    const statusEl = document.getElementById('status');
    const usersEl = document.getElementById('users');
    
    // Load initial data
    fetchData();
    
    // Set up event listeners
    refreshBtn.addEventListener('click', fetchData);
    resetBtn.addEventListener('click', resetConnections);
    pairBtn.addEventListener('click', pairUsers);
    
    // Functions
    function fetchData() {
      fetch('/debug/users')
        .then(response => response.json())
        .then(data => {
          statusEl.textContent = JSON.stringify({
            connections: data.connections,
            waitingUsers: data.waitingUsers.length,
            activePairs: Object.keys(data.activeConnections).length / 2
          }, null, 2);
          
          usersEl.textContent = JSON.stringify(data, null, 2);
        })
        .catch(error => {
          statusEl.textContent = 'Error fetching data: ' + error.message;
        });
    }
    
    function resetConnections() {
      fetch('/reset')
        .then(response => response.text())
        .then(data => {
          alert('Reset complete: ' + data);
          fetchData();
        })
        .catch(error => {
          alert('Error: ' + error.message);
        });
    }
    
    function pairUsers() {
      const user1 = document.getElementById('user1').value;
      const user2 = document.getElementById('user2').value;
      
      if (!user1 || !user2) {
        alert('Please enter both user IDs');
        return;
      }
      
      fetch('/force-pair?user1=' + user1 + '&user2=' + user2)
        .then((response) => response.text())
        .then((data) => {
          alert(data);
          fetchData();
        })
        .catch(error => {
          alert('Error: ' + error.message);
        });
    }
    
    // Auto-refresh every 5 seconds
    setInterval(fetchData, 5000);
  </script>
</body>
</html>`
);

// Start the server
const startServer = async () => {
  try {
    server.listen(PORT, async () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Local URL: http://localhost:${PORT}`);
      console.log(`🧪 Debug panel: http://localhost:${PORT}/debug`);
      
      // Create a public URL with localtunnel (attempting to find a clean URL)
      try {
        console.log(`📍 Creating a public URL with localtunnel... (this may take a moment)`);
        
        // Try multiple localtunnel attempts with different subdomains
        let tunnel = null;
        let attempts = 0;
        const maxAttempts = 5;
        
        while (!tunnel && attempts < maxAttempts) {
          attempts++;
          try {
            // Try with random subdomain
            const randomSubdomain = 'vchat-' + Math.floor(Math.random() * 100000);
            console.log(`Attempt ${attempts}/${maxAttempts}: Trying subdomain ${randomSubdomain}...`);
            
            tunnel = await localtunnel({
              port: PORT,
              subdomain: randomSubdomain
            });
            
            console.log(`🚀 Public URL: ${tunnel.url}`);
            console.log(`📝 Share this URL with anyone you want to join`);
            console.log(`📣 This URL provides direct access to your app`);
            console.log(`⚠️ This URL will stay active as long as your server is running`);
            
            tunnel.on('close', () => {
              console.log('📴 Tunnel closed');
            });
            
            tunnel.on('error', (err) => {
              console.error('⚠️ Tunnel error:', err);
            });
          } catch (ltError) {
            console.error(`\nAttempt ${attempts} failed:`, ltError.message);
            if (attempts >= maxAttempts) {
              throw ltError;
            }
            // Wait a moment before trying again
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (error) {
        console.error('❌ Error setting up public URL:', error);
        console.log(`🌐 Fallback to local URL: http://localhost:${PORT}`);
      }
      console.log(`📝 The first browser to connect will automatically become the host`);
    });
  } catch (error) {
    console.error('❌ Fatal error starting server:', error);
    process.exit(1); // Exit if server cannot start
  }
};

startServer(); // Run the server startup function
