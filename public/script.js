// Global app version - increment this for each update
const APP_VERSION = '1.0.1';

// DOM elements
// Initialize socket.io connection
let socket;

try {
  socket = io();
  console.log('Socket.io initialized successfully');
} catch (error) {
  console.error('Failed to initialize socket.io:', error);
  // Show error directly in status element since showError function isn't defined yet
  if (document.getElementById('status')) {
    document.getElementById('status').textContent = 'Failed to initialize socket connection. Please refresh the page.';
    document.getElementById('status').style.color = 'red';
  }
}

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusDiv = document.getElementById('status');
const connectionIdDiv = document.getElementById('connection-id');
const chatInput = document.getElementById('chat-input');
const sendMessageBtn = document.getElementById('send-message');
const toggleVideoBtn = document.getElementById('toggle-video');
const toggleAudioBtn = document.getElementById('toggle-audio');
const toggleChatBtn = document.getElementById('toggle-chat');
const nextPersonBtn = document.getElementById('next-person');
const chatMessages = document.getElementById('chat-messages');
const chatContainer = document.getElementById('chat-container');
const videoContainer = document.getElementById('video-container');
const localVideoContainer = document.getElementById('local-video-container');
const remoteVideoContainer = document.getElementById('remote-video-container');
const localOverlay = document.getElementById('local-overlay');
const remoteOverlay = document.getElementById('remote-overlay');
const rtcStateDisplay = document.getElementById('rtc-state');
const iceStateDisplay = document.getElementById('ice-state');
const signalStateDisplay = document.getElementById('signal-state');
const eventLog = document.getElementById('event-log'); // Event log for debug events
const debugInfo = document.getElementById('debug-info'); // Debug info display

// Host-related DOM elements
const showHostLoginBtn = document.getElementById('show-host-login-btn');
const hostAuthContainer = document.getElementById('host-auth-container');
const hostPasswordInput = document.getElementById('host-password');
const becomeHostBtn = document.getElementById('become-host-btn');
const hostStatusDiv = document.getElementById('host-status');
const hostControlsDiv = document.getElementById('host-controls');
const connectedClientInfoDiv = document.getElementById('connected-client-info');
const kickClientBtn = document.getElementById('kick-client-btn');
const banClientBtn = document.getElementById('ban-client-btn');

// Additional variable definitions to prevent reference errors
const signalStateSpan = signalStateDisplay; // Alias for signalStateDisplay
const iceStateSpan = iceStateDisplay; // Alias for iceStateDisplay
const remoteConnectionStatus = remoteOverlay; // Using overlay as status display
const showDebugBtn = document.getElementById('show-debug');
const debugModal = document.getElementById('debug-modal');
const closeDebugBtn = document.getElementById('close-debug');
const copyStateBtn = document.getElementById('copy-debug');
const copyLogsBtn = document.getElementById('copy-logs');
const nextBtn = document.getElementById('next');
const clearChatBtn = document.getElementById('clear-chat');
const localStats = document.getElementById('local-stats');
const remoteStats = document.getElementById('remote-stats');

// Chat functions
function enableChatFeatures() {
  // Enable chat input and send button
  chatInput.disabled = false;
  sendMessageBtn.disabled = false;
  
  // Update placeholder text to show it's ready
  chatInput.placeholder = "Type a message...";
}

// CRITICAL VIDEO CHECK FUNCTIONS:
// These functions will be used throughout the code to prevent overlay text when video is showing

// Check if remote video is active and playing
function isRemoteVideoActive() {
  return (
    remoteVideo && 
    remoteVideo.srcObject && 
    remoteVideo.srcObject.active && 
    remoteVideo.srcObject.getVideoTracks && 
    remoteVideo.srcObject.getVideoTracks().length > 0 && 
    remoteVideo.srcObject.getVideoTracks()[0].readyState === 'live'
  );
}

// Clear all overlay text completely
function clearRemoteOverlay() {
  if (remoteOverlay) {
    remoteOverlay.textContent = '';
    remoteOverlay.style.display = 'none';
    remoteOverlay.classList.remove('connecting', 'error', 'warning');
  }
}

// Update status function
function updateStatus(message, type = 'info') {
  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.classList.remove('info', 'error', 'warning');
    statusDiv.classList.add(type);
  }
  if (isRemoteVideoActive()) {
    clearRemoteOverlay();
  } else {
    if (remoteOverlay) {
      remoteOverlay.textContent = message;
      remoteOverlay.style.display = 'block';
      remoteOverlay.classList.remove('connecting', 'error', 'warning');
      remoteOverlay.classList.add(type);
    }
  }
}

// Global variables
// socket is initialized at the top of the file
let localStream;
let peerConnection;
let dataChannel;
let socketConnected = false;
let mediaAcquired = false;
let callInProgress = false;
let callInitiator = false;
let partnerId = null;
let reconnectTimer;
let reconnectAttempts = 0;
let messagesQueue = [];
let videoEnabled = true;
let audioEnabled = true;
let peerDisconnectReason;
let connectionStatsInterval;
let maintainanceInterval;

// Host-related variables
let isHost = false;
let connectedClientId = null;
let hostAvailable = false;
let hostAuthenticationInProgress = false;
let pendingCandidates = [];
let connectionStartTime = 0;
let events = []; // For logging events

// Helper function for logging events with timestamps
function logEvent(type, details = {}) {
    const event = {
        time: new Date(),
        type,
        details
    };
    events.push(event);
    
    // Add to event log if UI is available
    if (eventLog) {
        const eventElement = document.createElement('div');
        eventElement.className = `event ${type}`;
        eventElement.innerHTML = `<span class="event-time">${formatTime(event.time)}</span> <strong>${type}</strong>: ${JSON.stringify(details)}`;
        eventLog.prepend(eventElement);
        
        // Limit the number of events shown
        if (eventLog.children.length > 100) {
            eventLog.removeChild(eventLog.lastChild);
        }
    }
    
    console.log(`EVENT [${type}]`, details);
    return event;
}

// WebRTC configuration optimized for local network connections
const configuration = {
  iceServers: [
    // Use Google's public STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Add Twilio's TURN servers (these are more reliable than free alternatives)
    {
      urls: 'turn:global.turn.twilio.com:3478?transport=udp',
      username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d',
      credential: 'w1uxM55V9yXoqyVFjt+mxDBV0F87AUCemaYVQGxsPLw='
    },
    {
      urls: 'turn:global.turn.twilio.com:3478?transport=tcp',
      username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d',
      credential: 'w1uxM55V9yXoqyVFjt+mxDBV0F87AUCemaYVQGxsPLw='
    }
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all', // Allow both relay and direct connections
  sdpSemantics: 'unified-plan'
};

// Initialize the application - maximum reliability version with enhanced debugging
async function init() {
  try {
    updateStatus('Initializing...');
    console.log('Starting application initialization');
    
    // Initialize debug system first thing
    if (window.WebRTCDebug) {
      window.WebRTCDebug.init();
      window.WebRTCDebug.log('Application starting initialization', 'info');
    }
    
    // Set up event listeners for UI elements first
    setupEventListeners();
    console.log('Event listeners set up');
    
    // Connection timing measurements
    window.connectionTimingInfo = {
      initStart: Date.now(),
      mediaStart: 0,
      mediaEnd: 0,
      socketStart: 0,
      socketConnected: 0,
      offerCreated: 0,
      answerReceived: 0,
      connectionEstablished: 0
    };
    
    if (window.WebRTCDebug) {
      window.WebRTCDebug.log('Starting media acquisition', 'media');
    }
    
    // Try to get local media stream but don't block the rest of initialization
    window.connectionTimingInfo.mediaStart = Date.now();
    setupLocalStream().then(() => {
      window.connectionTimingInfo.mediaEnd = Date.now();
      const mediaSetupTime = window.connectionTimingInfo.mediaEnd - window.connectionTimingInfo.mediaStart;
      console.log(`Local media stream setup complete in ${mediaSetupTime}ms`);
      if (window.WebRTCDebug) {
        window.WebRTCDebug.log(`Media acquisition completed in ${mediaSetupTime}ms`, 'success');
      }
    }).catch(err => {
      console.warn('Media setup had issues:', err);
      if (window.WebRTCDebug) {
        window.WebRTCDebug.log(`Media setup error: ${err.message}`, 'error');
      }
    });
    
    // Connect to the signaling server with max compatibility options
    try {
      if (window.WebRTCDebug) {
        window.WebRTCDebug.log('Initializing Socket.IO connection...', 'rtc');
      }
      console.log('Initializing Socket.IO connection...');
      window.connectionTimingInfo.socketStart = Date.now();
      
      // Add ngrok bypass code if we're on an ngrok domain
      if (window.location.hostname.includes('ngrok')) {
        console.log('Detected ngrok URL, adding bypass headers');
        
        // Add meta tag to bypass ngrok warning screen
        const meta = document.createElement('meta');
        meta.name = 'ngrok-skip-browser-warning';
        meta.content = 'true';
        document.head.appendChild(meta);
        
        // Add CSS to hide any ngrok elements that might appear
        const style = document.createElement('style');
        style.textContent = `
          .ngrok-banner, #ngrok-banner, .ngrok-banner-container, #warning-screen {
            display: none !important;
          }
        `;
        document.head.appendChild(style);
      }
      
      // Initialize socket with ngrok bypass headers
      socket = io({
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true,
        forceNew: true,
        extraHeaders: {
          'ngrok-skip-browser-warning': 'true'
        }
      });
      
      // Add a direct connection event handler
      socket.on('connect', () => {
        window.connectionTimingInfo.socketConnected = Date.now();
        const socketConnectTime = window.connectionTimingInfo.socketConnected - window.connectionTimingInfo.socketStart;
        console.log(`Socket.IO connected in ${socketConnectTime}ms`);
        if (window.WebRTCDebug) {
          window.WebRTCDebug.log(`Socket.IO connected in ${socketConnectTime}ms`, 'success');
        }
      });
      
      // Add a direct connection error handler
      socket.on('connect_error', (err) => {
        console.error('Socket.IO connection error:', err);
        updateStatus('Connection error. Retrying...', 'error');
        if (window.WebRTCDebug) {
          window.WebRTCDebug.log(`Socket.IO connection error: ${err.message}`, 'error');
        }
      });
      
      // Add a direct connection timeout handler 
      socket.on('connect_timeout', () => {
        console.error('Socket.IO connection timeout');
        updateStatus('Connection timeout. Retrying...', 'error');
        if (window.WebRTCDebug) {
          window.WebRTCDebug.log('Socket.IO connection timeout', 'error');
        }
      });
      
      // Setup main socket event handlers
      setupSocketEvents();
      console.log('Socket event handlers set up');
      
      // Setup manual reconnect if socket disconnects
      setInterval(() => {
        if (socket && !socket.connected) {
          console.log('Attempting reconnection...');
          socket.connect();
          if (window.WebRTCDebug) {
            window.WebRTCDebug.log('Socket.IO reconnection attempt', 'warning');
          }
        }
      }, 5000);
      
    } catch (socketError) {
      console.error('Socket initialization error:', socketError);
      updateStatus('Server connection error. Text chat may not work.', 'error');
      if (window.WebRTCDebug) {
        window.WebRTCDebug.log(`Socket initialization error: ${socketError.message}`, 'error');
      }
    }
    
    // Display system information
    displaySystemInfo();
    
  } catch (error) {
    console.error('Critical initialization error:', error);
    updateStatus('Error initializing application. Try refreshing the page.', 'error');
    if (window.WebRTCDebug) {
      window.WebRTCDebug.log(`Critical initialization error: ${error.message}`, 'error');
    }
  }
}

// Function to display system information for debugging
function displaySystemInfo() {
  const browserInfo = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    vendor: navigator.vendor,
    language: navigator.language,
    mediaDevices: !!navigator.mediaDevices,
    webRTC: !!window.RTCPeerConnection
  };
  
  logEvent('system-info', browserInfo);
  
  if (debugInfo) {
    debugInfo.textContent = JSON.stringify(browserInfo, null, 2);
  }
  
  // Show connection ID
  connectionIdDiv.textContent = `Browser: ${navigator.userAgent.split(' ').slice(-1)[0]}`;
}

// Set up socket event handlers with improved reliability
function setupSocketEvents() {
  // Handle initial connection acknowledgement
  socket.on('connect', () => {
    logEvent('socket-connected');
    mySocketId = socket.id;
    updateStatus('Connected to server');
    connectionIdDiv.textContent = `Your ID: ${socket.id.substring(0, 6)}...`;
    remoteOverlay.textContent = 'Waiting for partner';
  });
  
  // Connection timeout handler
  let connectionTimeout;
  let connectionRetryCount = 0;
  const MAX_RETRIES = 3;

  // Reset any active connection timeouts
  function clearConnectionTimeouts() {
    if (connectionTimeout) {
      console.log('Clearing previous connection timeout');
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
  }

  // Set a timeout for connection establishment
  function setConnectionTimeout() {
    clearConnectionTimeouts();
    
    console.log('Setting connection timeout (10 seconds)');
    connectionTimeout = setTimeout(() => {
      console.warn('Connection timeout reached');
      
      if (connectionRetryCount < MAX_RETRIES) {
        connectionRetryCount++;
        console.log(`Retrying connection (attempt ${connectionRetryCount} of ${MAX_RETRIES})`);
        updateStatus(`Connection taking longer than expected. Retrying... (${connectionRetryCount}/${MAX_RETRIES})`, 'warning');
        
        // Restart connection process
        cleanupPeerConnection().then(() => {
          socket.emit('ready-for-connection');
        });
      } else {
        console.error('Max retries reached');
        updateStatus('Connection failed after multiple attempts. Please refresh.', 'error');
      }
    }, 10000); // 10 second timeout
  }

  // Handle new connection starting notification (for quicker connections)
  socket.on('connection-starting', (data) => {
    console.log('Connection starting notification received:', data);
    
    partnerId = data.partnerId;
    isInitiator = data.isInitiator;
    
    // Reset connection tracking
    connectionRetryCount = 0;
    connectionStartTime = Date.now();
    clearConnectionTimeouts();
    
    // Setup connection timeout
    setConnectionTimeout();
    
    updateStatus(`Partner found! ${isInitiator ? 'Initiating' : 'Accepting'} connection...`);
    remoteOverlay.textContent = 'Establishing connection...';
    remoteOverlay.classList.add('connecting');
    
    // Immediately start the connection process
    if (isInitiator) {
      console.log('Starting connection as initiator...');
      startConnection();
    } else {
      console.log('Waiting for incoming offer as receiver...');
    }
  });

  // Legacy partner-found handler (keeping for backward compatibility)
  socket.on('partner-found', (data) => {
    console.log('Partner found event received:', data);
    
    partnerId = data.partnerId;
    isInitiator = data.isInitiator;
    
    // Reset connection tracking
    connectionRetryCount = 0;
    connectionStartTime = Date.now();
    
    // Setup connection timeout
    setConnectionTimeout();
    
    updateStatus(`Partner found! ${isInitiator ? 'Initiating' : 'Accepting'} connection...`);
    remoteOverlay.textContent = 'Connecting...';
    remoteOverlay.classList.add('connecting');
    
    if (isInitiator) {
      console.log('Starting connection as initiator...');
      startConnection();
    }
  });

  // When connected to a partner
  socket.on('user-connected', async ({ partnerId: id }) => {
    logEvent('partner-found', { partnerId: id });
    partnerId = id;
    isInitiator = true;
    connectionStartTime = Date.now();
    
    updateStatus('Partner found! Starting connection...');
    remoteOverlay.textContent = 'Connecting...';
    remoteOverlay.classList.add('connecting');
    
    // Reset connection attempts
    connectionAttempts = 0;
    
    // Create peer connection and send offer
    try {
      await createPeerConnection();
      await createAndSendOffer();
    } catch (error) {
      logEvent('offer-creation-error', { error: error.message });
      console.error('Error establishing connection:', error);
      handleConnectionFailure();
    }
  });
  
  // Handle offer from remote peer
  socket.on('offer', async ({ offer, from }) => {
    try {
      console.log('Offer received from:', from, offer);
      logEvent('offer-received', { from, isHost: isHost });
      
      // Only accept offers if we're not the host (clients accept offers from host)
      if (isHost) {
        console.warn('Host received an offer, but hosts should send offers, not receive them');
        logEvent('offer-ignored', { reason: 'host-received-offer' });
        return;
      }
      
      // Store partner ID (the host) and mark as not the initiator
      partnerId = from;
      callInitiator = false;
      connectionStartTime = Date.now();
      
      updateStatus('Receiving connection from host...');
      remoteOverlay.textContent = 'Connecting to host...';
      
      // Clean up any existing connections first
      await cleanupPeerConnection();
      
      // Create new peer connection
      await createPeerConnection();
      
      console.log('Setting remote description (offer)');
      
      // Set remote description
      const remoteDesc = new RTCSessionDescription(offer);
      await peerConnection.setRemoteDescription(remoteDesc);
      logEvent('remote-description-set', { type: 'offer' });
      
      // Add any pending ICE candidates
      if (pendingCandidates.length > 0) {
        console.log('Adding pending candidates:', pendingCandidates.length);
        logEvent('adding-pending-candidates', { count: pendingCandidates.length });
        for (const candidate of pendingCandidates) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (error) {
            console.warn('Could not add pending candidate', error);
          }
        }
        pendingCandidates = [];
      }
      
      // Create and set local description (answer)
      console.log('Creating answer');
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      logEvent('answer-created');
      
      // Send answer back to the host
      console.log('Sending answer to host:', partnerId);
      socket.emit('answer', {
        answer: peerConnection.localDescription,
        to: partnerId
      });
      
      logEvent('answer-sent', { to: partnerId });
      updateStatus('Connecting to host...');
      
    } catch (error) {
      logEvent('offer-handling-error', { error: error.message });
      console.error('Error handling offer:', error);
      updateStatus('Error connecting to host. Please refresh.', 'error');
    }
  });
  
  // Handle answer from remote peer
  socket.on('answer', async ({ answer, from }) => {
    try {
      console.log('Answer received from:', from, answer);
      logEvent('answer-received', { from, isHost: isHost });
      
      // Only hosts should receive answers (from clients)
      if (!isHost) {
        console.warn('Client received an answer, but clients should send answers, not receive them');
        logEvent('answer-ignored', { reason: 'client-received-answer' });
        return;
      }
      
      // Validate connection state
      if (!peerConnection) {
        logEvent('answer-ignored', { reason: 'no-peer-connection' });
        console.warn('Received answer but no peer connection exists');
        return;
      }
      
      if (peerConnection.signalingState !== 'have-local-offer') {
        logEvent('answer-ignored', { reason: `wrong-state: ${peerConnection.signalingState}` });
        console.warn(`Ignoring answer: Peer connection in wrong state: ${peerConnection.signalingState}`);
        return;
      }
      
      // Set remote description
      console.log('Setting remote description (answer)');
      const remoteDesc = new RTCSessionDescription(answer);
      await peerConnection.setRemoteDescription(remoteDesc);
      
      logEvent('remote-description-set', { type: 'answer' });
      updateStatus('Client connected, establishing media connection...');
      
    } catch (error) {
      logEvent('answer-handling-error', { error: error.message });
      console.error('Error handling answer:', error);
      updateStatus('Error establishing connection with client. Trying again...', 'error');
      
      // Try to recover by restarting the connection
      setTimeout(() => {
        if (isHost) {
          createAndSendOffer();
        }
      }, 3000);
    }
  });
  
  // Handle ICE candidates
  socket.on('ice-candidate', async ({ candidate, from }) => {
    try {
      if (from !== partnerId) {
        return; // Ignore candidates from other peers
      }
      
      logEvent('ice-candidate-received', { from });
      
      if (peerConnection && peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        logEvent('ice-candidate-added');
      } else {
        // Store candidates until remote description is set
        logEvent('ice-candidate-pending');
        pendingCandidates.push(candidate);
      }
    } catch (error) {
      logEvent('ice-candidate-error', { error: error.message });
      console.error('Error adding ICE candidate:', error);
    }
  });
  
  // Handle text chat messages
  socket.on('chat-message', ({ text, from, time }) => {
    if (from === partnerId) {
      addMessageToChat(text, 'received', new Date(time));
    }
  });
  
  // Handle partner disconnection
  socket.on('partner-disconnected', ({ reason }) => {
    logEvent('partner-disconnected', { reason });
    updateStatus('Partner disconnected', 'warning');
    
    // Clean up connections
    cleanupPeerConnection();
    
    // Update UI
    remoteOverlay.textContent = 'Partner left';
    remoteOverlay.classList.remove('connecting');
    remoteVideo.srcObject = null;
    remoteStats.textContent = '';
    partnerId = null;
    
    // Disable chat input
    chatInput.disabled = true;
    sendMessageBtn.disabled = true;
    
    // Wait briefly before looking for a new partner
    setTimeout(() => {
      if (socket.connected && !partnerId) {
        remoteOverlay.textContent = 'Looking for a new partner...';
        socket.emit('ready-for-connection');
      }
    }, 2000);
  });
  
  // Handle waiting for partner
  socket.on('waiting', () => {
    logEvent('waiting-for-partner');
    updateStatus('Waiting for a partner...');
    remoteOverlay.textContent = 'Waiting for partner';
    remoteOverlay.classList.remove('connecting');
    partnerId = null;
    
    // Clear remote video
    if (remoteVideo.srcObject) {
      remoteVideo.srcObject.getTracks().forEach(track => track.stop());
      remoteVideo.srcObject = null;
    }
    
    // Clean up peer connection
    cleanupPeerConnection();
  });
  
  // Handle server errors
  socket.on('error', ({ message }) => {
    logEvent('server-error', { message });
    console.error('Server error:', message);
    updateStatus(`Server error: ${message}`, 'error');
  });
  
  // Handle disconnection
  socket.on('disconnect', (reason) => {
    logEvent('socket-disconnected', { reason });
    updateStatus('Disconnected from server', 'error');
    
    // Clean up connections
    cleanupPeerConnection();
    
    // Update UI
    remoteOverlay.textContent = 'Server connection lost';
    connectionIdDiv.textContent = 'Disconnected';
    
    // Try to reconnect after a delay
    setTimeout(() => {
      if (!socket.connected) {
        updateStatus('Attempting to reconnect...', 'warning');
        socket.connect();
      }
    }, 3000);
  });
  
  // Handle reconnection
  socket.on('reconnect', (attemptNumber) => {
    logEvent('socket-reconnected', { attemptNumber });
    updateStatus('Reconnected to server');
    
    // Register as available for connection
    socket.emit('ready-for-connection');
  });
  
  // Tell the server we're ready for connections once socket is set up
  socket.emit('ready-for-connection');
}

// Set up local media stream with robust fallbacks for all environments
async function setupLocalStream() {
  try {
    console.log('Starting media setup...');
    updateStatus('Setting up video chat...');
    
    // Add explicit logging about browser capabilities
    console.log('Browser media capabilities:', {
      mediaDevices: !!navigator.mediaDevices,
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      browser: navigator.userAgent
    });
    
    let stream = null;
    
    // First attempt: Try to get both audio and video with explicit constraints
    try {
      console.log('Requesting audio and video...');
      // Force browser to show permission dialog
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });
      console.log('Successfully got audio and video', stream);
    } catch (err) {
      console.warn('First attempt failed:', err.name, err.message);
      
      // Special handling for 'Device in use' error
      if (err.name === 'NotReadableError' && err.message.includes('Device in use')) {
        console.error('Camera is in use by another application');
        updateStatus('Camera in use by another app. Please close other camera apps.', 'error');
        logEvent('camera-in-use-error');
        
        // Create an alert message in the local video overlay
        if (localOverlay) {
          localOverlay.innerHTML = '<div style="padding: 10px; color: #fff; background: rgba(255,0,0,0.7); border-radius: 5px">' +
            '<strong>Camera in use by another application</strong><br>' +
            'Please close other applications using your camera:<br>' +
            '• Other browser tabs/windows<br>' +
            '• Video conferencing apps<br>' +
            '• Camera apps or utilities<br>' +
            'Then refresh this page.</div>';
          localOverlay.style.display = 'flex';
        }
      }
      
      // Second attempt: Try just audio
      try {
        console.log('Trying audio only...');
        updateStatus('Video unavailable. Trying audio only.', 'warning');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
        console.log('Successfully got audio only');
      } catch (audioErr) {
        console.warn('Audio attempt failed:', audioErr.name, audioErr.message);
        
        // Third attempt: Try just video with simpler constraints
        try {
          console.log('Trying video only with basic constraints...');
          updateStatus('Audio unavailable. Trying video only.', 'warning');
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true
          });
          console.log('Successfully got video only');
        } catch (videoErr) {
          console.warn('Video attempt failed:', videoErr.name, videoErr.message);
          // Final fallback: Empty stream
          console.log('Creating empty stream as fallback');
          stream = new MediaStream();
          updateStatus('No media access. Text chat only.', 'warning');
        }
      }
    }
    
    // Store the stream we obtained
    localStream = stream;
    
    // Connect the stream to the video element
    try {
      localVideo.srcObject = localStream;
      console.log('Connected stream to video element');
    } catch (e) {
      console.error('Error setting srcObject:', e);
      // Try older approach for compatibility
      try {
        localVideo.src = URL.createObjectURL(localStream);
        console.log('Used createObjectURL as fallback');
      } catch (objErr) {
        console.error('Failed to set video source:', objErr);
      }
    }
    
    // Update UI based on what tracks we have
    const hasVideo = localStream.getVideoTracks().length > 0;
    const hasAudio = localStream.getAudioTracks().length > 0;
    console.log(`Media status: video=${hasVideo}, audio=${hasAudio}`);
    
    // Update UI accordingly
    if (!hasVideo) {
      localOverlay.textContent = 'No video';
      localOverlay.style.display = 'flex';
      toggleVideoBtn.disabled = true;
    } else {
      localOverlay.textContent = '';
      localOverlay.style.display = 'none';
    }
    
    if (!hasAudio) {
      toggleAudioBtn.disabled = true;
    }
    
    if (!hasVideo && !hasAudio) {
      updateStatus('No camera or microphone access. Text chat only.', 'warning');
      localOverlay.textContent = 'Text chat only';
      localOverlay.style.display = 'flex';
      localOverlay.classList.add('warning');
    }
    
    return localStream;
  } catch (error) {
    console.error('Error in setupLocalStream:', error);
    updateStatus('Media access error. Text chat will still work.', 'warning');
    // Return empty stream as ultimate fallback
    return new MediaStream();
  }
}

// Create and configure WebRTC peer connection with optimized media transmission
async function createPeerConnection() {
  try {
    if (window.WebRTCDebug) {
      window.WebRTCDebug.log('Starting peer connection creation', 'rtc');
    }
    
    // Record connection start time 
    const connStartTime = Date.now();
    window.connectionTimingInfo.peerConnectionStart = connStartTime;
    
    // Clean up any existing connection
    if (peerConnection) {
      if (window.WebRTCDebug) {
        window.WebRTCDebug.log('Cleaning up existing peer connection', 'rtc');
      }
      await cleanupPeerConnection();
    }
    
    console.log('Creating new peer connection with explicit media constraints');
    
    // Create new connection with optimized configuration
    const customConfig = {
      ...configuration,
      // These are critical for stable connections
      sdpSemantics: 'unified-plan',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all'
    };
    
    if (window.WebRTCDebug) {
      window.WebRTCDebug.log(`Using ICE servers: ${customConfig.iceServers.length}`, 'ice');
      customConfig.iceServers.forEach((server, index) => {
        window.WebRTCDebug.log(`ICE server ${index+1}: ${server.urls}`, 'ice');
      });
    }
    
    peerConnection = new RTCPeerConnection(customConfig);
    console.log('Peer connection created:', peerConnection);
    
    // Enhance WebRTC monitoring if debug system available
    if (window.WebRTCDebug && window.WebRTCDebug.enhanceMonitoring) {
      window.WebRTCDebug.enhanceMonitoring(peerConnection);
    }
    
    // Track connection creation time
    window.connectionTimingInfo.peerConnectionCreated = Date.now();
    const createTime = window.connectionTimingInfo.peerConnectionCreated - connStartTime;
    if (window.WebRTCDebug) {
      window.WebRTCDebug.log(`Peer connection created in ${createTime}ms`, 'rtc');
    }
    
    // Set up data channel for text chat
    if (isInitiator) {
      if (window.WebRTCDebug) {
        window.WebRTCDebug.log('Creating data channel as initiator', 'rtc');
      }
      dataChannel = peerConnection.createDataChannel('chat', {
        ordered: true
      });
      setupDataChannel(dataChannel);
    } else {
      if (window.WebRTCDebug) {
        window.WebRTCDebug.log('Setting up data channel handler as receiver', 'rtc');
      }
      peerConnection.ondatachannel = (event) => {
        console.log('Data channel received:', event.channel);
        if (window.WebRTCDebug) {
          window.WebRTCDebug.log('Data channel received', 'rtc');
        }
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
      };
    }
    
    // CRUCIAL FIX: Add local tracks to the connection with specific constraints
    console.log('Adding media tracks to connection...');
    if (localStream) {
      // Explicitly get tracks and log them
      const audioTracks = localStream.getAudioTracks();
      const videoTracks = localStream.getVideoTracks();
      
      console.log(`Local stream has ${audioTracks.length} audio tracks and ${videoTracks.length} video tracks`);
      
      // Add audio tracks first (higher priority)
      audioTracks.forEach(track => {
        console.log('Adding audio track:', track.id, track.label, track.enabled, track.muted);
        peerConnection.addTrack(track, localStream);
      });
      
      // Add video tracks
      videoTracks.forEach(track => {
        console.log('Adding video track:', track.id, track.label, track.enabled, track.muted);
        peerConnection.addTrack(track, localStream);
      });
      
      // Create a synthetic audio track if none exists
      if (audioTracks.length === 0) {
        try {
          console.log('No audio tracks found, attempting to create audio context');
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioCtx.createOscillator();
          const dest = audioCtx.createMediaStreamDestination();
          oscillator.connect(dest);
          oscillator.frequency.setValueAtTime(0, audioCtx.currentTime); // Silent
          oscillator.start();
          
          // Add this synthetic audio track
          const silentAudioTrack = dest.stream.getAudioTracks()[0];
          if (silentAudioTrack) {
            console.log('Adding synthetic silent audio track to help establish connection');
            peerConnection.addTrack(silentAudioTrack, dest.stream);
          }
        } catch (e) {
          console.warn('Could not create synthetic audio track:', e);
        }
      }
    } else {
      console.warn('No local stream available when creating peer connection');
    }
    
    // Set up ICE candidate handling - CRITICAL FOR MEDIA FLOW
    peerConnection.onicecandidate = (event) => {
      console.log('ICE candidate:', event.candidate);
      if (event.candidate && partnerId) {
        // Send immediately without waiting
        socket.emit('ice-candidate', {
          candidate: event.candidate,
          to: partnerId
        });
      }
    };
    
    // Handle ICE gathering state
    peerConnection.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', peerConnection.iceGatheringState);
      if (peerConnection.iceGatheringState === 'complete') {
        console.log('ICE gathering completed');
      }
    };
    
    // ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      console.log('ICE connection state change:', state);
      
      // Safely update the display element if it exists
      if (typeof iceStateDisplay !== 'undefined' && iceStateDisplay) {
        iceStateDisplay.textContent = state;
      }
      
      switch (state) {
        case 'connected':
        case 'completed':
          updateStatus('Connection established');
          remoteOverlay.classList.remove('connecting');
          remoteOverlay.textContent = '';
          
          // Enable chat features once connected
          enableChatFeatures();
          
          // Critical: Start periodic connection maintenance to keep media flowing
          startConnectionMaintenance();
          break;
          
        case 'disconnected':
          updateStatus('Connection interrupted', 'warning');
          remoteOverlay.textContent = 'Connection interrupted';
          // Try to immediately recover the connection
          tryToRecoverConnection();
          break;
          
        case 'failed':
          updateStatus('Connection failed', 'error');
          remoteOverlay.textContent = 'Connection failed';
          handleConnectionFailure();
          break;
      }
    };
    
    // Signaling state changes
    peerConnection.onsignalingstatechange = () => {
      const state = peerConnection.signalingState;
      console.log('Signaling state change:', state);
      // Make sure the element exists before accessing it
      if (typeof signalStateDisplay !== 'undefined' && signalStateDisplay) {
        signalStateDisplay.textContent = state;
      }
    };
    
    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log('Connection state change:', state);
      // Safely update display if it exists
      if (typeof rtcStateDisplay !== 'undefined' && rtcStateDisplay) {
        rtcStateDisplay.textContent = state;
      }
      
      // Auto-recovery for failed connections
      if (state === 'connected') {
        isConnected = true;
        console.log('WebRTC connection established successfully');
      } else if (state === 'failed' || state === 'disconnected') {
        console.log('Connection state problem detected - attempting recovery');
        // Try to restart after a short delay
        setTimeout(() => {
          if (peerConnection && isInitiator) {
            tryToRecoverConnection();
          }
        }, 2000);
      }
    };
    
    // Track event - when remote tracks are added - CRITICAL FOR MEDIA RECEPTION
    peerConnection.ontrack = (event) => {
      console.log('>>> Received remote track event:', event);
      if (event.streams && event.streams[0]) {
        console.log('>>> Remote stream:', event.streams[0]);
        const audioTracks = event.streams[0].getAudioTracks();
        console.log('>>> Remote audio tracks:', audioTracks);
        if (audioTracks.length > 0) {
          console.log(`>>> Remote audio track[0] - Kind: ${audioTracks[0].kind}, ID: ${audioTracks[0].id}, Enabled: ${audioTracks[0].enabled}, ReadyState: ${audioTracks[0].readyState}, Muted: ${audioTracks[0].muted}`);
        }
        const videoTracks = event.streams[0].getVideoTracks();
        console.log('>>> Remote video tracks:', videoTracks);
         if (videoTracks.length > 0) {
           console.log(`>>> Remote video track[0] - Kind: ${videoTracks[0].kind}, ID: ${videoTracks[0].id}, Enabled: ${videoTracks[0].enabled}, ReadyState: ${videoTracks[0].readyState}, Muted: ${videoTracks[0].muted}`);
         }
      } else {
          console.log('>>> event.streams[0] is not available.');
      }
       if(event.track) {
           console.log(`>>> Event track details - Kind: ${event.track.kind}, ID: ${event.track.id}, Enabled: ${event.track.enabled}, ReadyState: ${event.track.readyState}, Muted: ${event.track.muted}`);
       } else {
           console.log('>>> event.track is not available.');
       }
      console.log('Received remote track:', event.track.kind);
      
      // Clear connection timeout since we're receiving media
      clearConnectionTimeouts();
      
      // Always ensure we have the stream attached to the video element
      // This is critical for Firefox-Chrome compatibility
      if (event.streams && event.streams[0]) {
        console.log('Setting remote stream to video element directly');
        
        // CRITICAL FIX: Force attach the media stream to the video element
        remoteVideo.srcObject = event.streams[0];
        
        // Force autoplay settings
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        
        // Force playback to start
        remoteVideo.play().catch(e => {
          console.warn('Error playing remote video:', e);
          // Try one more time with a delay (helps on Firefox)
          setTimeout(() => remoteVideo.play().catch(() => {}), 1000);
        });
        
        // CRITICAL FIX: Always completely clear any overlay text
        clearRemoteOverlay();
        
        // Also set a periodic checker to ensure overlay stays cleared
        const clearOverlayInterval = setInterval(() => {
          if (isRemoteVideoActive()) {
            clearRemoteOverlay();
          } else if (!remoteVideo || !remoteVideo.srcObject) {
            // Stop checking if video is gone
            clearInterval(clearOverlayInterval);
          }
        }, 500);
        
        // Mark as connected and update status (only in status bar)
        isConnected = true;
        if (statusDiv) {
          statusDiv.textContent = 'Connection established';
          statusDiv.classList.remove('error', 'warning');
          statusDiv.classList.add('info');
        }
        
        // Log successful connection time for diagnostics
        const connectionTime = Date.now() - connectionStartTime;
        console.log(`Connection established in ${connectionTime}ms`);
      } else {
        console.warn('No streams available in track event');
      }
      
      // Add specific handling by track type
      if (event.track.kind === 'audio') {
        console.log('Remote audio track received - enabling audio playback');
        // Ensure audio is unmuted and playing
        remoteVideo.muted = false;
      } 
      else if (event.track.kind === 'video') {
        console.log('Remote video track received - ensuring display is active');
        
        // Monitor for video freezes
        event.track.onended = () => {
          console.log('Remote video track ended - attempting to recover');
          updateStatus('Video ended. Attempting to reconnect...', 'warning');
          setTimeout(() => tryToRecoverConnection(), 1000);
        };
        
        event.track.onmute = () => {
          console.log('Remote track muted');
          updateStatus('Remote video muted', 'warning');
        };
        
        event.track.onunmute = () => {
          console.log('Remote track active again');
          updateStatus('Media connection active');
        };
      }
    };
    
    return peerConnection;
    
  } catch (error) {
    console.error('Error creating peer connection:', error);
    updateStatus('Connection error', 'error');
    throw error;
  }
}

// Connection maintenance function to keep media flowing
function startConnectionMaintenance() {
  console.log('Starting connection maintenance');
  
  // Clear any existing interval
  if (statsInterval) {
    clearInterval(statsInterval);
  }
  
  // Set up periodic checks
  statsInterval = setInterval(async () => {
    if (!peerConnection || !isConnected) {
      clearInterval(statsInterval);
      return;
    }
    
    try {
      // Get connection stats
      const stats = await peerConnection.getStats();
      let audioReceiving = false;
      let videoReceiving = false;
      
      stats.forEach(report => {
        if (report.type === 'inbound-rtp') {
          if (report.kind === 'audio') {
            audioReceiving = true;
          } else if (report.kind === 'video') {
            videoReceiving = true;
          }
        }
      });
      
      // Update status displays
      if (remoteStats) {
        remoteStats.textContent = `Audio: ${audioReceiving ? 'receiving' : 'not receiving'}, Video: ${videoReceiving ? 'receiving' : 'not receiving'}`;
      }
      
      // If audio/video not flowing but connection is established, try a reconnection
      if (isConnected && !audioReceiving && !videoReceiving && peerConnection.iceConnectionState === 'connected') {
        console.log('Media not flowing despite connection - attempting refresh');
        tryToRecoverConnection();
      }
    } catch (e) {
      console.warn('Error in connection maintenance:', e);
    }
  }, 3000);
}

// Try to recover a broken connection
async function tryToRecoverConnection() {
  console.log('Attempting to recover connection...');
  
  if (!peerConnection || !isInitiator) return;
  
  try {
    // Create a new offer with iceRestart to refresh candidates
    const offer = await peerConnection.createOffer({ iceRestart: true });
    await peerConnection.setLocalDescription(offer);
    
    if (partnerId) {
      console.log('Sending connection recovery offer');
      socket.emit('offer', {
        offer: peerConnection.localDescription,
        to: partnerId
      });
    }
  } catch (e) {
    console.error('Error recovering connection:', e);
  }
}

// Setup local media stream with comprehensive error handling & browser compatibility
async function setupLocalStream() {
  console.log('Starting media stream setup');

  // Define video constraints for full camera view, no cropping
  const videoConstraints = {
    width: { ideal: 1280 },  // Higher resolution to avoid cropping
    height: { ideal: 720 },  // 16:9 aspect ratio
    facingMode: 'user',
    resizeMode: 'none'       // Don't resize/crop the video
  };

  // Define audio constraints with fallback options
  const audioConstraints = {
    echoCancellation: { ideal: true }, // Make this optional
    noiseSuppression: { ideal: true },  // Make this optional
    autoGainControl: { ideal: true }    // Make this optional
  };

  try {
    console.log('Attempting to access camera and microphone...');
    updateStatus('Requesting camera and microphone access...');

    // Global variable to store stream
    let stream = null;

    // FIRST ATTEMPT: Try to get media with standard constraints
    try {
      console.log('Trying to get audio+video with standard constraints');
      stream = await navigator.mediaDevices.getUserMedia({
        video: true, // Use simple boolean to maximize compatibility
        audio: true
      });

      console.log('Camera and microphone access granted successfully');
      updateStatus('Camera and microphone connected');
    }
    catch (fullError) {
      console.warn('Full media access error:', fullError);

      // SECOND ATTEMPT: Try video only
      try {
        console.log('Trying video only');
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });

        console.log('Video-only access granted');
        updateStatus('Camera access granted (no audio)', 'warning');
      }
      catch (videoError) {
        console.warn('Video access denied:', videoError);

        // THIRD ATTEMPT: Try audio only
        try {
          console.log('Trying audio only');
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
          });

          console.log('Audio-only access granted');
          updateStatus('Microphone access granted (no video)', 'warning');
        }
        catch (audioError) {
          console.warn('All media access denied:', audioError);

          // FINAL FALLBACK: Create empty stream
          console.log('Creating empty stream as fallback');
          stream = new MediaStream();
          updateStatus('No media access. Text chat only.', 'warning');
        }
      }
    }

    // Store our stream in the global variable
    localStream = stream;

    // Connect stream to video element with error handling
    try {
      console.log('Connecting stream to video element');
      localVideo.srcObject = localStream;

      // CRITICAL: Set video element to play automatically
      localVideo.autoplay = true;
      localVideo.playsInline = true;
      localVideo.muted = true; // Mute local video (avoid feedback)

      // Force video to play (helps on some browsers)
      localVideo.play().catch(e => console.warn('Error auto-playing:', e));
    } catch (videoElementError) {
      console.error('Error connecting stream to video element:', videoElementError);
    }

    // Update UI based on available tracks
    const hasVideo = localStream.getVideoTracks().length > 0;
    const hasAudio = localStream.getAudioTracks().length > 0;

    console.log(`Media status: video=${hasVideo}, audio=${hasAudio}`);

    // Update UI elements
    if (!hasVideo) {
      console.log('No video available, updating UI');
      localOverlay.textContent = 'No camera';
      localOverlay.style.display = 'flex';
      if (toggleVideoBtn) toggleVideoBtn.disabled = true;
    } else {
      console.log('Video available, ready to display');
      localOverlay.textContent = '';
      localOverlay.style.display = 'none';
    }

    if (!hasAudio) {
      console.log('No audio available');
      if (toggleAudioBtn) toggleAudioBtn.disabled = true;
    }

    return localStream;

  } catch (error) {
    console.error('Critical error in setupLocalStream:', error);
    updateStatus('Media setup error. Text chat only.', 'error');
    return new MediaStream(); // Return empty stream as ultimate fallback
  }
  
  return localStream;
}

// Create WebRTC peer connection with data channel for text chat
async function createPeerConnection() {
  try {
    // Clean up existing connection if any
    cleanupPeerConnection();
    
    // Create new peer connection with simplified config
    peerConnection = new RTCPeerConnection(configuration);
    console.log('Created new peer connection');
    
    // Ensure we have a local stream
    if (!localStream) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        }).catch(err => {
          console.warn('Could not get video, trying audio only', err);
          return navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true
          });
        }).catch(err => {
          console.warn('Could not get audio either, continuing without media', err);
          return new MediaStream();
        });
        
        localVideo.srcObject = localStream;
      } catch (err) {
        console.error('Failed to create local stream:', err);
        // Continue without media
        localStream = new MediaStream();
      }
    }
    
    // Force add local tracks to the connection
    console.log('Adding tracks to connection');
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log('Adding track:', track.kind);
        peerConnection.addTrack(track, localStream);
      });
    }
    
    // Always create data channel regardless of who initiated
    console.log('Creating data channel for text chat');
    try {
      dataChannel = peerConnection.createDataChannel('chat', {
        ordered: true,
        negotiated: true, // Pre-negotiated channel
        id: 0 // Use same ID on both sides
      });
      setupDataChannel(dataChannel);
    } catch (e) {
      console.error('Failed to create data channel:', e);
      // Fallback to server-based chat
    }
    
    // Set up handler for receiving data channel (backup)
    peerConnection.ondatachannel = event => {
      console.log('Received data channel:', event.channel.label);
      if (!dataChannel || dataChannel.readyState !== 'open') {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
      }
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = event => {
      if (event.candidate && partnerId) {
        // Send immediately without waiting
        socket.emit('ice-candidate', {
          candidate: event.candidate,
          to: partnerId
        });
        console.log('Sending ICE candidate to partner');
      }
    };
    
    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      iceStateSpan.textContent = peerConnection.iceConnectionState;
      console.log('ICE connection state:', peerConnection.iceConnectionState);
      
      switch(peerConnection.iceConnectionState) {
        case 'checking':
          remoteConnectionStatus.textContent = 'Connecting...';
          remoteConnectionStatus.classList.add('connecting');
          break;
        case 'connected':
        case 'completed':
          remoteConnectionStatus.textContent = 'Connected';
          remoteConnectionStatus.classList.remove('connecting');
          updateStatus('Connection established!');
          break;
        case 'disconnected':
          remoteConnectionStatus.textContent = 'Reconnecting...';
          remoteConnectionStatus.classList.add('connecting');
          updateStatus('Connection unstable. Trying to reconnect...', 'warning');
          break;
        case 'failed':
          remoteConnectionStatus.textContent = 'Failed';
          remoteConnectionStatus.classList.remove('connecting');
          updateStatus('Connection failed. Click Next to try a new partner.', 'error');
          break;
        case 'closed':
          remoteConnectionStatus.textContent = 'Disconnected';
          updateStatus('Connection closed');
          break;
      }
    };
    
    // Signaling state changes
    peerConnection.onsignalingstatechange = () => {
      signalStateSpan.textContent = peerConnection.signalingState;
      console.log('Signaling state:', peerConnection.signalingState);
    };
    
    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
      switch(peerConnection.connectionState) {
        case 'connected':
          connectionAttempts = 0; // Reset connection attempts
          updateStatus('Connection established!');
          break;
        case 'disconnected':
          updateStatus('Connection unstable. Trying to reconnect...', 'warning');
          break;
        case 'failed':
          handleConnectionFailure();
          break;
        case 'closed':
          updateStatus('Connection closed');
          break;
      }
    };
    
    // Handle incoming media tracks
    peerConnection.ontrack = event => {
      console.log('Received remote track:', event.track.kind);
      if (remoteVideo.srcObject !== event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        updateStatus('Connected to partner!');
        
        // Update remote video status when tracks are added or removed
        const videoTrack = event.streams[0].getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            remoteConnectionStatus.textContent = 'Video ended';
          };
          remoteConnectionStatus.textContent = 'Video connected';
        } else {
          remoteConnectionStatus.textContent = 'Audio only';
        }
      }
    };
    
    return peerConnection;
  } catch (error) {
    console.error('Error creating peer connection:', error);
    updateStatus('Error creating connection. Please refresh and try again.', 'error');
    throw error;
  }
}

// Set up the data channel for text chat
function setupDataChannel(channel) {
  if (!channel) return;
  
  // Store the data channel reference
  dataChannel = channel;
  
  // Set up data channel event handlers
  channel.onopen = () => {
    logEvent('data-channel-open');
    console.log('Data channel opened');
    
    // Enable chat features now that data channel is open
    enableChatFeatures();
  };
  
  channel.onclose = () => {
    logEvent('data-channel-closed');
    console.log('Data channel closed');
    
    // Disable chat input when data channel closes
    chatInput.disabled = true;
    sendMessageBtn.disabled = true;
  };
  
  channel.onerror = (error) => {
    logEvent('data-channel-error', { error: error.message || 'Unknown data channel error' });
    console.error('Data channel error:', error);
  };
  
  // Handle incoming messages
  channel.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      logEvent('data-channel-message-received', { type: data.type });
      
      // Handle different message types
      switch (data.type) {
        case 'chat':
          addMessageToChat(data.text, 'received', new Date(data.time));
          // Send delivery receipt
          if (data.messageId && channel.readyState === 'open') {
            channel.send(JSON.stringify({
              type: 'delivery-receipt',
              messageId: data.messageId,
              time: new Date().toISOString()
            }));
          }
          break;
          
        case 'typing':
          showTypingIndicator();
          break;
          
        case 'delivery-receipt':
          // Update UI to show message was delivered
          const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
          if (messageElement) {
            const receiptElement = messageElement.querySelector('.message-receipt');
            if (receiptElement) {
              receiptElement.textContent = '✓✓';
              receiptElement.classList.add('delivered');
            }
          }
          break;
          
        case 'stats':
          // Update remote stats if provided
          if (data.stats && remoteStats) {
            remoteStats.textContent = `${data.stats.video || 'No video'}, ${data.stats.audio || 'No audio'}`;
          }
          break;
      }
    } catch (error) {
      console.error('Error processing data channel message:', error);
    }
  };
}

// Set up event listeners for UI elements
function setupEventListeners() {
  // Host login toggle button
  if (showHostLoginBtn) {
    showHostLoginBtn.addEventListener('click', () => {
      // Toggle the host authentication container visibility
      const isCurrentlyVisible = hostAuthContainer.style.display !== 'none';
      hostAuthContainer.style.display = isCurrentlyVisible ? 'none' : 'flex';
      
      // Also toggle host controls visibility if they exist
      if (hostControlsDiv) {
        hostControlsDiv.style.display = isCurrentlyVisible ? 'none' : 'flex';
      }
      
      // Update button text based on visibility
      showHostLoginBtn.innerHTML = isCurrentlyVisible ? 
        '<i class="fas fa-crown"></i> Host Options' : 
        '<i class="fas fa-crown"></i> Hide Host Options';
    });
  }
  
  // Become Host button - handle password verification
  if (becomeHostBtn && hostPasswordInput && hostStatusDiv) {
    becomeHostBtn.addEventListener('click', () => {
      authenticateAsHost();
    });
  }
  
  // Handle host authentication response
  socket.on('auth-result', (data) => {
    // Reset authentication in progress flag
    hostAuthenticationInProgress = false;
    becomeHostBtn.disabled = false;
    
    if (hostStatusDiv) {
      if (data.success) {
        isHost = true;
        updateHostStatus('Authentication successful! You are now the host.', 'success');
        updateHostControls();
        
        // Show host UI
        if (hostControlsDiv) {
          hostControlsDiv.style.display = 'flex';
        }
        
        // Hide password input
        if (hostPasswordInput) {
          hostPasswordInput.disabled = true;
        }
        if (becomeHostBtn) {
          becomeHostBtn.disabled = true;
        }
        
        // Create peer connection as host immediately
        console.log('Creating peer connection as host');
        createPeerConnection();
        
        // Actively check for waiting clients
        console.log('Host checking for waiting clients');
        socket.emit('check-waiting-clients');
      } else {
        updateHostStatus(`Authentication failed: ${data.message}`, 'error');
      }
    }
    
    // Log the event
    logEvent('auth-result', { success: data.success });
  });
  
  // Toggle audio muting
  toggleAudioBtn.addEventListener('click', () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length === 0) return;
      
      isAudioMuted = !isAudioMuted;
      audioTracks.forEach(track => track.enabled = !isAudioMuted);
      
      // Update button UI
      toggleAudioBtn.innerHTML = isAudioMuted ? 
        '<i class="fas fa-microphone-slash"></i><span class="label">Unmute Audio</span>' :
        '<i class="fas fa-microphone"></i><span class="label">Mute Audio</span>';
      
      logEvent('audio-toggle', { muted: isAudioMuted });
    }
  });
  
  // Toggle video
  toggleVideoBtn.addEventListener('click', () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length === 0) return;
      
      isVideoHidden = !isVideoHidden;
      videoTracks.forEach(track => track.enabled = !isVideoHidden);
      
      // Update button UI
      toggleVideoBtn.innerHTML = isVideoHidden ? 
        '<i class="fas fa-video-slash"></i><span class="label">Show Video</span>' :
        '<i class="fas fa-video"></i><span class="label">Hide Video</span>';
      
      // Update video overlay
      localOverlay.textContent = isVideoHidden ? 'Video paused' : '';
      
      logEvent('video-toggle', { hidden: isVideoHidden });
    }
  });
  
  // Toggle chat visibility
  toggleChatBtn.addEventListener('click', () => {
    const chatContainer = document.querySelector('.chat-container');
    isChatVisible = !isChatVisible;
    
    if (chatContainer) {
      if (isChatVisible) {
        chatContainer.style.display = 'flex';
        toggleChatBtn.innerHTML = '<i class="fas fa-comments"></i><span class="label">Hide Chat</span>';
      } else {
        chatContainer.style.display = 'none';
        toggleChatBtn.innerHTML = '<i class="fas fa-comments"></i><span class="label">Show Chat</span>';
      }
    }
  });
  
  // Next partner button
  nextBtn.addEventListener('click', async () => {
    logEvent('next-partner-clicked');
    updateStatus('Looking for a new partner...');
    
    // Clean up existing connection
    await cleanupPeerConnection();
    
    // Clear chat
    clearChatMessages();
    
    // Update UI
    remoteVideo.srcObject = null;
    remoteOverlay.textContent = 'Finding new partner...';
    remoteStats.textContent = '';
    
    // Tell the server we want a new partner
    socket.emit('next-partner');
  });
  
  // Send message button
  sendMessageBtn.addEventListener('click', sendTextMessage);
  
  // Send message on Enter key
  chatInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendTextMessage();
    }
  });
  
  // Show typing indicator
  chatInput.addEventListener('input', () => {
    if (dataChannel && dataChannel.readyState === 'open' && chatInput.value.trim()) {
      dataChannel.send(JSON.stringify({
        type: 'typing',
        time: new Date().toISOString()
      }));
    }
  });
  
  // Clear chat button
  clearChatBtn.addEventListener('click', () => {
    clearChatMessages();
  });
  
  // Debug panel controls
  const showDebugBtn = document.getElementById('show-debug');
  const debugModal = document.getElementById('debug-modal');
  const closeDebugBtn = debugModal ? debugModal.querySelector('.close-btn') : null; // Ensure modal exists
  const runDiagnosticBtn = document.getElementById('run-diagnostic-btn'); // Assuming this exists
  const debugInfo = document.getElementById('debug-info'); // Assuming this exists
  const debugLogContainer = document.getElementById('debug-log'); // Assuming this exists

  if (showDebugBtn && debugModal) {
    showDebugBtn.addEventListener('click', () => {
      console.log('Show Debug button clicked'); // Add console log for debugging
      debugModal.classList.remove('hidden');
      logEvent('debug-panel-opened');
      // Optionally run diagnostics when opened
      // if (runDiagnosticBtn) runDiagnosticBtn.click(); 
    });
  }

  if (closeDebugBtn && debugModal) {
    closeDebugBtn.addEventListener('click', () => {
      console.log('Close Debug button clicked'); // Add console log for debugging
      debugModal.classList.add('hidden');
    });
  } else {
    // Log if the close button wasn't found, helps debugging
    if (!closeDebugBtn) console.warn('Debug modal close button not found.');
  }

  // Fullscreen button event listeners
  const localFullscreenBtn = document.getElementById('local-fullscreen-btn');
  const remoteFullscreenBtn = document.getElementById('remote-fullscreen-btn');
  
  if (localFullscreenBtn) {
    localFullscreenBtn.addEventListener('click', () => toggleFullscreen('local'));
  }
  
  if (remoteFullscreenBtn) {
    remoteFullscreenBtn.addEventListener('click', () => toggleFullscreen('remote'));
  }

  // Listener for running diagnostics (if the button exists)
  if (runDiagnosticBtn && debugInfo) {
    runDiagnosticBtn.addEventListener('click', async () => {
      logEvent('diagnostic-run');
    
      // Add diagnostic info to log
      const diagnosticInfo = {
        browser: navigator.userAgent,
        webRTC: !!window.RTCPeerConnection,
        mediaDevices: !!navigator.mediaDevices,
        socketConnected: socket?.connected,
        peerConnectionState: peerConnection?.connectionState,
        iceConnectionState: peerConnection?.iceConnectionState,
        dataChannelState: dataChannel?.readyState,
        localStreamTracks: {
          audio: localStream?.getAudioTracks().length || 0,
          video: localStream?.getVideoTracks().length || 0
        }
      };
    
      logEvent('diagnostic-info', diagnosticInfo);
    
      // Update the debug info with diagnostic results
      const debugInfo = document.getElementById('debug-info');
      if (debugInfo) {
        debugInfo.textContent = 'Running diagnostic...\n\n' + JSON.stringify(diagnosticInfo, null, 2);
        
        // Test media devices
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const hasCamera = devices.some(device => device.kind === 'videoinput');
          const hasMicrophone = devices.some(device => device.kind === 'audioinput');
        
          diagnosticInfo.devices = {
            cameras: devices.filter(d => d.kind === 'videoinput').length,
            microphones: devices.filter(d => d.kind === 'audioinput').length,
            speakers: devices.filter(d => d.kind === 'audiooutput').length
          };
        
          logEvent('device-enumeration', diagnosticInfo.devices);
          debugInfo.textContent = JSON.stringify(diagnosticInfo, null, 2);
        } catch (error) {
          logEvent('diagnostic-error', { error: error.message });
          debugInfo.textContent += '\n\nError enumerating devices: ' + error.message;
        }
      }
    });
  }
  
  // Refresh connection button
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      if (!partnerId || !peerConnection) {
        updateStatus('No active connection to refresh');
        return;
      }
    
      logEvent('connection-refresh');
      updateStatus('Refreshing connection...', 'warning');
      
      try {
        // Create a new offer with ICE restart to refresh the connection
        const offer = await peerConnection.createOffer({ iceRestart: true });
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('offer', {
          offer: peerConnection.localDescription,
          to: partnerId
        });
        
        logEvent('ice-restart-offer-sent');
      } catch (error) {
        logEvent('refresh-error', { error: error.message });
        console.error('Error refreshing connection:', error);
      }
    });
  }
  
  // Start WebRTC connection with accelerated ICE handling
async function startConnection() {
  try {
    console.log('Starting peer connection with optimized ICE handling');
    await createPeerConnection();
    
    // Create and send offer if we're the initiator
    if (isInitiator) {
      console.log('Creating offer as initiator');
      
      // Add specific configuration for faster connections
      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: false,       // Not restarting yet
        voiceActivityDetection: true
      };
      
      const offer = await peerConnection.createOffer(offerOptions);
      console.log('Offer created successfully');
      
      await peerConnection.setLocalDescription(offer);
      console.log('Local description set');
      
      // Optimization: Send offer immediately without waiting for all ICE candidates
      // This dramatically speeds up connection establishment
      if (partnerId) {
        console.log('Sending offer immediately for faster connection');
        socket.emit('offer', {
          offer: peerConnection.localDescription,
          to: partnerId
        });
      }
      
      // Start ICE timeout - if connection doesn't establish after a reasonable time
      setTimeout(() => {
        if (peerConnection && peerConnection.iceConnectionState !== 'connected' && 
            peerConnection.iceConnectionState !== 'completed') {
          console.log('ICE connection taking too long, forcing restart');
          tryToRecoverConnection();
        }
      }, 8000); // 8 seconds timeout
    }
  } catch (error) {
    console.error('Error starting connection:', error);
    updateStatus('Connection error. Retrying...', 'error');
    
    // Auto-retry on error
    setTimeout(() => {
      console.log('Auto-retrying connection after error');
      cleanupPeerConnection().then(() => {
        if (isInitiator && partnerId) {
          startConnection();
        }
      });
    }, 2000); // 2 second retry delay
  }
}

  // Handle window beforeunload to notify partner
  window.addEventListener('beforeunload', () => {
    if (socket && socket.connected && partnerId) {
      socket.emit('manual-disconnect', { partnerId });
    }
  });
}

// Create and send offer to remote peer
async function createAndSendOffer() {
  try {
    if (!peerConnection) {
      console.log('Creating new peer connection for offer...');
      createPeerConnection();
    }
    
    console.log('Creating offer for client:', partnerId);
    logEvent('creating-offer', { target: partnerId, isHost: isHost });
    
    // Create offer with transceiver options to optimize for video chat
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
      voiceActivityDetection: true
    });
    
    console.log('Setting local description...');
    await peerConnection.setLocalDescription(offer);
    
    // Wait for ICE gathering to complete or timeout
    await waitForIceGathering();
    
    // Send the offer to the signaling server
    if (socket && socket.connected) {
      console.log('Sending offer to client:', partnerId);
      socket.emit('offer', {
        offer: peerConnection.localDescription,
        to: partnerId
      });
      
      logEvent('offer-sent', { target: partnerId });
      updateStatus('Connection offer sent to client', 'connecting');
    } else {
      throw new Error('Socket not connected, cannot send offer');
    }
  } catch (error) {
    console.error('Error creating/sending offer:', error);
    logEvent('offer-error', { message: error.message });
    
    // Attempt to handle the error gracefully
    if (error.name === 'NotReadableError') {
      // This usually means camera/mic access issues
      updateStatus('Media device error. Try refreshing the page.', 'error');
    } else {
      updateStatus('Error connecting to client. Trying again...', 'error');
      
      // Clean up and try again
      cleanupPeerConnection().then(() => {
        setTimeout(createAndSendOffer, 2000); // Retry after delay
      });
    }
  }
}

// Wait for ICE gathering to complete or timeout
async function waitForIceGathering(timeout = 2000) {
  if (!peerConnection) return;
  
  logEvent('ice-gathering-wait-start');
  
  // If ICE gathering is already complete, return immediately
  if (peerConnection.iceGatheringState === 'complete') {
    logEvent('ice-gathering-already-complete');
    return;
  }
  
  // Wait for ICE gathering to complete or timeout
  return new Promise((resolve) => {
    const checkState = () => {
      if (peerConnection.iceGatheringState === 'complete') {
        clearTimeout(timer);
        peerConnection.removeEventListener('icegatheringstatechange', checkState);
        logEvent('ice-gathering-complete');
        resolve();
      }
    };
    
    // Set up a timeout
    const timer = setTimeout(() => {
      peerConnection.removeEventListener('icegatheringstatechange', checkState);
      logEvent('ice-gathering-timeout');
      resolve(); // Resolve anyway after timeout
    }, timeout);
    
    // Check the current state and also listen for changes
    peerConnection.addEventListener('icegatheringstatechange', checkState);
    checkState();
  });
}

// Handle connection failures with retry logic
function handleConnectionFailure() {
  logEvent('connection-failure', { attempt: connectionAttempts, max: maxConnectionAttempts });
  
  // First check if we already have a working media stream - if so, don't show retrying
  if (remoteVideo && remoteVideo.srcObject && remoteVideo.srcObject.active && 
      remoteVideo.srcObject.getVideoTracks().length > 0 && 
      remoteVideo.srcObject.getVideoTracks()[0].readyState === 'live') {
    console.log('Video is already working, skipping retry messages');
    // Clear any existing retry messages and don't show overlay
    if (remoteOverlay) {
      remoteOverlay.textContent = '';
      remoteOverlay.style.display = 'none';
      remoteOverlay.classList.remove('connecting');
    }
    // Update only status bar, never the overlay
    updateStatus('Connection established', 'success');
    return;
  }
  
  connectionAttempts++;
  console.log(`Connection failure handling - attempt ${connectionAttempts}/${maxConnectionAttempts}`);
  
  if (connectionAttempts < maxConnectionAttempts) {
    // Only update the status bar, no overlay on video
    updateStatus(`Retrying connection (${connectionAttempts}/${maxConnectionAttempts})...`, 'warning');
    
    // Clear any previous timers
    clearTimeout(reconnectTimer);
    
    // Wait briefly then retry
    reconnectTimer = setTimeout(() => {
      cleanupPeerConnection()
        .then(() => {
          // Start new connection
          if (isInitiator && partnerId) {
            startConnection();
          }
        })
        .catch(error => {
          console.error('Error during retry:', error);
          // Don't call handleConnectionFailure recursively to avoid infinite loops
        });
    }, 1000);
  } else {
    // We've reached max attempts
    logEvent('connection-failure-max-attempts');
    updateStatus('Connection failed after multiple attempts', 'error');
    
    // Only show failure in overlay if we don't have video
    if (!remoteVideo.srcObject || !remoteVideo.srcObject.active) {
      remoteOverlay.textContent = 'Connection failed';
      remoteOverlay.classList.add('error');
    }
    
    // Notify the server to try a new partner
    if (socket.connected) {
      socket.emit('connection-failed');
    }
    
    // Clean up connection
    cleanupPeerConnection();
    
    // Reset attempts
    connectionAttempts = 0;
  }
}

// Helper function to update connection UI
function updateConnectionUI() {
  if (!peerConnection) return;
  
  // Check if elements exist before updating them
  // These are optional diagnostic elements
  try {
    const rtcStateEl = document.getElementById('rtc-state');
    const iceStateEl = document.getElementById('ice-state');
    const signalStateEl = document.getElementById('signal-state');
    
    if (rtcStateEl) rtcStateEl.textContent = peerConnection.connectionState || 'New';
    if (iceStateEl) iceStateEl.textContent = peerConnection.iceConnectionState || 'New';
    if (signalStateEl) signalStateEl.textContent = peerConnection.signalingState || 'New';
  } catch (e) {
    // Silently fail - these are just debug elements
    console.debug('Debug UI elements not found, ignoring');
  }
}

// Update connection state UI
function updateConnectionStateUI() {
  if (!peerConnection) return;
  
  // This is a duplicate of updateConnectionUI but kept for backward compatibility
  // Use safe element finding to avoid errors
  try {
    const iceEl = document.getElementById('ice-state-span');
    const signalEl = document.getElementById('signal-state-span');
    
    if (iceEl) iceEl.textContent = peerConnection.iceConnectionState || 'New';
    if (signalEl) signalEl.textContent = peerConnection.signalingState || 'New';
  } catch (e) {
    // Silent fail for diagnostic elements
    console.debug('Debug state elements not available');
  }
}

// Clean up peer connection and resources
function cleanupPeerConnection() {
  // Clear reconnection timer if active
  clearTimeout(reconnectTimer);
  
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  
  if (peerConnection) {
    // Remove all event listeners
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.onicegatheringstatechange = null;
    peerConnection.onsignalingstatechange = null;
    peerConnection.oniceconnectionstatechange = null;
    peerConnection.ondatachannel = null;
    
    // Close the connection
    peerConnection.close();
    peerConnection = null;
    
    // Clear remote video
    if (remoteVideo.srcObject) {
      remoteVideo.srcObject.getTracks().forEach(track => track.stop());
      remoteVideo.srcObject = null;
    }
    
    console.log('Peer connection cleaned up');
  }
  
  // Reset chat UI
  chatInput.disabled = true;
  sendMessageBtn.disabled = true;
  chatInput.placeholder = 'Waiting for connection...';
}

// Add message to chat
function addMessageToChat(text, type, time) {
  const messageEl = document.createElement('div');
  messageEl.classList.add('message', type);
  
  const messageContent = document.createElement('div');
  messageContent.classList.add('message-content');
  messageContent.textContent = text;
  
  const messageTime = document.createElement('div');
  messageTime.classList.add('message-time');
  messageTime.textContent = formatTime(time);
  
  messageEl.appendChild(messageContent);
  messageEl.appendChild(messageTime);
  
  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // Remove typing indicator if exists
  const typingIndicator = chatMessages.querySelector('.typing-indicator');
  if (typingIndicator) {
    chatMessages.removeChild(typingIndicator);
  }
}

// Format time for chat messages
function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Show typing indicator
function showTypingIndicator() {
  // Remove existing typing indicator
  const existingIndicator = chatMessages.querySelector('.typing-indicator');
  if (existingIndicator) {
    clearTimeout(existingIndicator.dataset.timeout);
    existingIndicator.dataset.timeout = setTimeout(() => {
      if (existingIndicator.parentNode) {
        existingIndicator.parentNode.removeChild(existingIndicator);
      }
    }, 3000);
    return;
  }
  
  // Create typing indicator
  const indicator = document.createElement('div');
  indicator.classList.add('message', 'received', 'typing-indicator');
  indicator.innerHTML = '<div class="dots"><span></span><span></span><span></span></div>';
  
  chatMessages.appendChild(indicator);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // Auto-remove typing indicator after 3 seconds
  const timeout = setTimeout(() => {
    if (indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  }, 3000);
  
  indicator.dataset.timeout = timeout;
}

// Clear chat messages
function clearChatMessages() {
  while (chatMessages.firstChild) {
    chatMessages.removeChild(chatMessages.firstChild);
  }
}

// Send a text message
function sendTextMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  
  // Send via data channel if available and open
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify({
      type: 'chat',
      text: text
    }));
    addMessageToChat(text, 'sent', new Date());
  } else {
    // Fallback to signaling server
    if (window.location.hostname.includes('ngrok')) {
      // Create a style to hide the ngrok warning if it appears
      const style = document.createElement('style');
      style.textContent = `
        #ngrok_url_notice, .ngrok-warning-banner, #warning-screen {
          display: none !important;
        }
      `;
      document.head.appendChild(style);
      
      // Add meta tag to help bypass ngrok warning
      const meta = document.createElement('meta');
      meta.name = 'ngrok-skip-browser-warning';
      meta.content = 'true';
      document.head.appendChild(meta);
    }
    
    // Connect to Socket.IO server with ngrok bypass headers
    const socket = io({
      extraHeaders: {
        'ngrok-skip-browser-warning': 'true'
      }
    });
    
    socket.emit('chat-message', {
      text: text,
      to: partnerId
    });
    addMessageToChat(text, 'sent', new Date());
  }
  
  // Clear input field
  chatInput.value = '';
  chatInput.focus();
}

// Set up UI elements and control buttons
function setupUI() {
  // Disable chat until connection is established
  chatInput.disabled = true;
  sendMessageBtn.disabled = true;
  
  // Mute/unmute audio button
  muteAudioBtn.addEventListener('click', () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        isAudioMuted = !isAudioMuted;
        audioTracks[0].enabled = !isAudioMuted;
        
        if (isAudioMuted) {
          muteAudioBtn.innerHTML = '<i class="fas fa-microphone-slash"></i><span class="label">Unmute</span>';
        } else {
          muteAudioBtn.innerHTML = '<i class="fas fa-microphone"></i><span class="label">Mute</span>';
        }
      }
    }
  });
  
  // Hide/show video button
  hideVideoBtn.addEventListener('click', () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        isVideoHidden = !isVideoHidden;
        videoTracks[0].enabled = !isVideoHidden;
        
        if (isVideoHidden) {
          hideVideoBtn.innerHTML = '<i class="fas fa-video-slash"></i><span class="label">Show Video</span>';
        } else {
          hideVideoBtn.innerHTML = '<i class="fas fa-video"></i><span class="label">Hide Video</span>';
        }
      }
    }
  });
  
  // Toggle chat visibility
  toggleChatBtn.addEventListener('click', () => {
    const chatContainer = document.querySelector('.chat-container');
    isChatVisible = !isChatVisible;
    
    if (isChatVisible) {
      chatContainer.style.display = 'flex';
      toggleChatBtn.innerHTML = '<i class="fas fa-comments"></i><span class="label">Hide Chat</span>';
    } else {
      chatContainer.style.display = 'none';
      toggleChatBtn.innerHTML = '<i class="fas fa-comments"></i><span class="label">Show Chat</span>';
    }
  });
  
  // Next partner button
  nextBtn.addEventListener('click', () => {
    if (socket && socket.connected) {
      updateStatus('Finding a new partner...');
      cleanupPeerConnection();
      
      // Request a new partner instead of reloading the page
      socket.emit('find-new-partner');
    }
  });
  
  // Send message button
  sendMessageBtn.addEventListener('click', sendTextMessage);
  
  // Send message on Enter key
  chatInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendTextMessage();
    }
  });
  
  // Send typing indicator
  chatInput.addEventListener('input', () => {
    if (chatInput.value.trim() && dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(JSON.stringify({ type: 'typing' }));
    } else if (chatInput.value.trim() && socket && partnerId) {
      socket.emit('typing');
    }
  });
}

// This is a duplicate function that has been moved to the top of the file

// Host authentication and control functions
function setupHostAuthentication() {
  
  // Add event listener for the become host button
  if (becomeHostBtn) {
    becomeHostBtn.addEventListener('click', () => {
      authenticateAsHost();
    });
  }
  
  // Add event listeners for kick and ban buttons
  if (kickClientBtn) {
    kickClientBtn.addEventListener('click', () => {
      if (!isHost || !connectedClientId) return;
      
      // Confirm kick action
      if (confirm('Are you sure you want to kick this client?')) {
        socket.emit('kick-user');
        updateHostStatus('Kicking client...', 'info');
      }
    });
  }
  
  if (banClientBtn) {
    banClientBtn.addEventListener('click', () => {
      if (!isHost || !connectedClientId) return;
      
      // Confirm ban action
      if (confirm('Are you sure you want to ban this client by IP? This is permanent for this session.')) {
        socket.emit('ban-user');
        updateHostStatus('Banning client...', 'info');
      }
    });
  }
}

// Update host status display
function updateHostStatus(message, type = 'info') {
  if (!hostStatusDiv) return;
  
  hostStatusDiv.textContent = message;
  
  // Reset all classes
  hostStatusDiv.classList.remove('success', 'error', 'warning', 'info');
  
  // Add appropriate class
  hostStatusDiv.classList.add(type);
}

// Update host control UI based on client connection
function updateHostControls() {
  if (!isHost) {
    // Hide host controls if not host
    if (hostControlsDiv) hostControlsDiv.classList.add('hidden');
    return;
  }
  
  // Show host controls
  if (hostControlsDiv) hostControlsDiv.classList.remove('hidden');
  
  // Update client info and button states
  if (connectedClientId) {
    if (connectedClientInfoDiv) {
      connectedClientInfoDiv.textContent = `Client connected: ${connectedClientId.substring(0, 6)}...`;
    }
    
    if (kickClientBtn) kickClientBtn.disabled = false;
    if (banClientBtn) banClientBtn.disabled = false;
  } else {
    if (connectedClientInfoDiv) {
      connectedClientInfoDiv.textContent = 'No client connected';
    }
    
    if (kickClientBtn) kickClientBtn.disabled = true;
    if (banClientBtn) banClientBtn.disabled = true;
  }
}

// Add host-related socket events
function setupHostSocketEvents() {
  if (!socket) return;
  
  // Handle being automatically made a host (first user)
  socket.on('auto-host', (data) => {
    console.log('Automatically made host:', data);
    isHost = true;
    
    // Show host UI
    if (hostControlsDiv) {
      hostControlsDiv.classList.remove('hidden');
    }
    
    // Update status display
    updateStatus('You are the host. Waiting for clients...', 'info');
    
    // Create peer connection as host immediately
    console.log('Creating peer connection as host');
    createPeerConnection();
    
    // Actively check for waiting clients
    console.log('Host checking for waiting clients');
    socket.emit('check-waiting-clients');
  });
  
  // Handle authentication result (deprecated but keeping for backward compatibility)
  socket.on('auth-result', (result) => {
    hostAuthenticationInProgress = false;
    becomeHostBtn.disabled = false;
    
    if (hostStatusDiv) {
      if (result.success) {
        isHost = true;
        updateHostStatus('Authentication successful! You are now the host.', 'success');
        updateHostControls();
        
        // Show host UI
        if (hostControlsDiv) {
          hostControlsDiv.classList.remove('hidden');
        }
        
        // Hide password input
        if (hostPasswordInput) {
          hostPasswordInput.disabled = true;
        }
        if (becomeHostBtn) {
          becomeHostBtn.disabled = true;
        }
        
        // Create peer connection as host immediately
        console.log('Creating peer connection as host');
        createPeerConnection();
        
        // Actively check for waiting clients
        console.log('Host checking for waiting clients');
        socket.emit('check-waiting-clients');
      } else {
        updateHostStatus(`Authentication failed: ${result.message}`, 'error');
      }
    }
    
    // Log the event
    logEvent('auth-result', { success: result.success });
  });
  
  // Handle client connection
  socket.on('client-connected', (data) => {
    if (!isHost) return;
    
    connectedClientId = data.partnerId;
    updateStatus(`Client connected: ${connectedClientId.substring(0, 6)}...`, 'connected');
    updateHostStatus(`Client connected: ${connectedClientId.substring(0, 6)}...`, 'info');
    updateHostControls();
    
    // Create an offer for the client
    partnerId = connectedClientId;
    callInitiator = true;
    
    // Wait a bit to make sure client is ready
    setTimeout(() => {
      console.log('Host creating offer for client:', partnerId);
      
      if (peerConnection && peerConnection.connectionState !== 'connected') {
        createAndSendOffer();
      }
    }, 1000);
  });
  
  // Handle client disconnection
  socket.on('client-disconnected', () => {
    if (!isHost) return;
    
    // Clean up the connection
    cleanupPeerConnection();
    
    // Create a new peer connection to be ready for the next client
    setTimeout(() => {
      createPeerConnection();
    }, 1000);
    
    connectedClientId = null;
    updateStatus('Client disconnected', 'waiting');
    updateHostStatus('Client disconnected', 'info');
    updateHostControls();
  });
  
  // Handle action results (kick/ban)
  socket.on('action-result', (result) => {
    if (!isHost) return;
    
    if (result.success) {
      if (result.action === 'kick') {
        updateHostStatus(`Client ${result.kickedId.substring(0, 6)}... was kicked successfully`, 'success');
      } else if (result.action === 'ban') {
        updateHostStatus(`Client ${result.bannedId.substring(0, 6)}... was banned successfully (IP: ${result.bannedIp})`, 'success');
      }
      connectedClientId = null;
      updateHostControls();
      
      // Create a new peer connection to be ready for the next client
      setTimeout(() => {
        createPeerConnection();
      }, 1000);
    } else {
      updateHostStatus(`Action failed: ${result.message}`, 'error');
    }
  });
  
  // Handle host status
  socket.on('host-status', (data) => {
    hostAvailable = data.isHostAvailable;
    
    if (hostAvailable && !isHost) {
      updateHostStatus('A host is available. You can connect as a client.', 'info');
      
      // Automatically connect to the host - don't wait for the server to initiate
      console.log('Host available, sending automatic connection request');
      socket.emit('connect-to-host');
    } else if (!hostAvailable && !isHost) {
      updateHostStatus('No host available. You can become the host with the password.', 'info');
    }
  });
  
  // Handle being kicked
  socket.on('kicked', (data) => {
    updateStatus(`You have been kicked: ${data.reason}`, 'error');
    cleanupPeerConnection();
  });
  
  // Handle being banned
  socket.on('banned', (data) => {
    updateStatus(`You have been banned: ${data.reason}`, 'error');
    cleanupPeerConnection();
    
    // Disable reconnection attempts since we're banned
    socket.disconnect();
  });
  
  // Handle being connected to host (client side)
  socket.on('connected-to-host', (data) => {
    console.log('Connected to host:', data);
    updateStatus('Connected to host. Establishing connection...', 'connecting');
    
    // Store partner ID (the host)
    partnerId = data.partnerId;
    callInitiator = false;
    
    // Create peer connection as client
    createPeerConnection();
    
    // The host will send us an offer
  });
  
  // Handle waiting for host
  socket.on('waiting-for-host', () => {
    console.log('Waiting for host to become available');
    updateStatus('Waiting for host...', 'waiting');
  });
  
  // Handle host busy
  socket.on('host-busy', () => {
    console.log('Host is busy with another client');
    updateStatus('Host is busy with another client. Please wait...', 'waiting');
  });
  
  // Handle host disconnected
  socket.on('host-disconnected', () => {
    console.log('Host disconnected');
    updateStatus('Host disconnected. Please wait for a new host or become the host.', 'disconnected');
    cleanupPeerConnection();
  });
}

// Initialize host functions in the original init function
function initializeHost() {
  setupHostAuthentication();
  setupHostSocketEvents();
}

// Add host initialization to the main init function
const originalInit = init;
init = function() {
  originalInit();
  initializeHost();
};

// Toggle fullscreen function for video elements
function toggleFullscreen(videoType) {
  const wrapper = videoType === 'local' ? 
    document.querySelector('.video-wrapper.local') : 
    document.getElementById('remote-video-wrapper');
  
  const button = videoType === 'local' ? 
    document.getElementById('local-fullscreen-btn') : 
    document.getElementById('remote-fullscreen-btn');
    
  const icon = button.querySelector('i');
    
  if (!wrapper) return;
  
  if (!document.fullscreenElement) {
    // Enter fullscreen
    if (wrapper.requestFullscreen) {
      wrapper.requestFullscreen();
    } else if (wrapper.webkitRequestFullscreen) {
      wrapper.webkitRequestFullscreen();
    } else if (wrapper.msRequestFullscreen) {
      wrapper.msRequestFullscreen();
    }
    
    // Update button icon
    if (icon) icon.className = 'fas fa-compress';
    wrapper.classList.add('fullscreen');
  } else {
    // Exit fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
    
    // Update button icon
    if (icon) icon.className = 'fas fa-expand';
    wrapper.classList.remove('fullscreen');
  }
}

// Listen for fullscreen change event
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    // Reset all icons when exiting fullscreen
    const fullscreenBtns = document.querySelectorAll('.fullscreen-btn');
    fullscreenBtns.forEach(btn => {
      const icon = btn.querySelector('i');
      if (icon) icon.className = 'fas fa-expand';
    });
    
    // Remove fullscreen class from all wrappers
    const videoWrappers = document.querySelectorAll('.video-wrapper');
    videoWrappers.forEach(wrapper => wrapper.classList.remove('fullscreen'));
  }
});

// Start the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Display version number
  const versionDisplay = document.createElement('div');
  versionDisplay.id = 'version-display';
  versionDisplay.textContent = `v${APP_VERSION}`;
  versionDisplay.style.position = 'fixed';
  versionDisplay.style.top = '5px';
  versionDisplay.style.right = '10px';
  versionDisplay.style.background = 'rgba(0,0,0,0.6)';
  versionDisplay.style.color = '#fff';
  versionDisplay.style.padding = '2px 8px';
  versionDisplay.style.borderRadius = '10px';
  versionDisplay.style.fontSize = '12px';
  versionDisplay.style.zIndex = '9999';
  document.body.appendChild(versionDisplay);
  
  // Initialize application
  init();
  
  // Override console.log to also log to our debug panel
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  
  console.log = function(...args) {
    // Call original console.log
    originalConsoleLog.apply(console, args);
    
    // Also log to our debug panel
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ');
    
    // Use our existing logging function if available
    if (typeof logInfo === 'function') {
      logInfo(message);
    }
  };
  
  console.warn = function(...args) {
    // Call original console.warn
    originalConsoleWarn.apply(console, args);
    
    // Also log to our debug panel
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ');
    
    // Use our existing logging function if available
    if (typeof logWarn === 'function') {
      logWarn(message);
    }
  };
  
  console.error = function(...args) {
    // Call original console.error
    originalConsoleError.apply(console, args);
    
    // Also log to our debug panel
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ');
    
    // Use our existing logging function if available
    if (typeof logError === 'function') {
      logError(message);
    }
  };
});

// Add detailed logging to host authentication functions on the client
function authenticateAsHost() {
    const password = hostPasswordInput.value;
    if (!password) {
        console.log('[CLIENT LOG] Host authentication failed: No password provided');
        updateHostStatus('Please enter the host password', 'error');
        return;
    }

    console.log('[CLIENT LOG] Attempting to authenticate as host...');
    updateHostStatus('Authenticating...', 'info');
    hostAuthenticationInProgress = true;
    
    // Disable the button while authenticating
    if (becomeHostBtn) {
        becomeHostBtn.disabled = true;
    }
    
    // Emit authentication event to the server
    console.log('[CLIENT LOG] Emitting authenticate-host event');
    try {
        socket.emit('authenticate-host', { password: password });
    } catch (error) {
        console.error('[CLIENT LOG] Error sending authentication request:', error);
        updateHostStatus('Error connecting to server', 'error');
        resetHostAuthUI();
        return;
    }

    // Set a timeout for authentication feedback
    window.authTimeout = setTimeout(() => {
        console.log('[CLIENT LOG] Authentication timeout');
        updateHostStatus('Authentication timed out', 'error');
        resetHostAuthUI();
    }, 10000); // 10 second timeout
}

// Helper function to reset the host auth UI
function resetHostAuthUI() {
    hostAuthenticationInProgress = false;
    if (becomeHostBtn) {
        becomeHostBtn.disabled = false;
    }
    if (hostAuthSection) {
        hostAuthSection.style.display = 'block';
    }
    if (hostPasswordInput) {
        hostPasswordInput.value = '';
    }
}

// Event listener for host authentication result
socket.on('auth-result', (data) => {
    console.log('[CLIENT LOG] Received auth-result event:', data);
    // Use window.authTimeout to ensure it's the same variable
    if (window.authTimeout) {
        clearTimeout(window.authTimeout);
        window.authTimeout = null;
    }
    
    // Reset host authentication progress flag
    hostAuthenticationInProgress = false;
    
    if (data.success) {
        console.log('[CLIENT LOG] Host authentication successful. Host ID:', data.hostId);
        updateHostStatus('Authenticated as Host!', 'success');
        isHost = true;
        
        // Update UI
        if (hostAuthSection) hostAuthSection.style.display = 'none';
        if (hostPasswordInput) hostPasswordInput.disabled = true;
        if (becomeHostBtn) becomeHostBtn.disabled = true;
        if (hostControlsDiv) hostControlsDiv.style.display = 'block';
        
        // Create peer connection as host immediately
        console.log('Creating peer connection as host');
        createPeerConnection();
        
        // Actively check for waiting clients
        console.log('Host checking for waiting clients');
        socket.emit('check-waiting-clients');
    } else {
        console.log('[CLIENT LOG] Host authentication failed:', data.message);
        updateHostStatus(`Authentication Failed: ${data.message}`, 'error');
        resetHostAuthUI();
        isHost = false;
    }
});

// Add listener for server log messages (will be added by server)
socket.on('server-log', (message) => {
    console.log(`[SERVER] ${message}`);
});
