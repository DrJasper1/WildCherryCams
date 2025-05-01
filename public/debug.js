// Comprehensive WebRTC Debug System
// This file adds detailed debugging functionality to the video chat app

// Create global debug log container
let debugLogs = [];
let statsUpdateInterval = null;

// Initialize debug panel to capture and display all connection information
function initDebugSystem() {
  console.log('Initializing enhanced debugging system');
  
  // Create the debug panel UI
  createDebugPanel();
  
  // Start capturing console logs
  interceptConsoleLogs();
  
  // Add global error handling
  window.addEventListener('error', (event) => {
    addDebugLog('ERROR: ' + event.message, 'error');
  });
  
  // Start connection stats monitoring
  startStatsMonitoring();
}

// Create a debug panel in the UI
function createDebugPanel() {
  // Check if debug panel already exists
  if (document.getElementById('debug-panel')) return;
  
  // First create a toggle button that will always be visible
  const toggleButton = document.createElement('button');
  toggleButton.id = 'debug-toggle-button';
  toggleButton.textContent = 'Show Debug';
  toggleButton.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    background-color: rgba(0, 0, 0, 0.7);
    color: #0f0;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 5px 10px;
    font-family: monospace;
    cursor: pointer;
    z-index: 9998;
  `;
  document.body.appendChild(toggleButton);
  
  // Create debug panel container (hidden by default)
  const debugPanel = document.createElement('div');
  debugPanel.id = 'debug-panel';
  debugPanel.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 300px;
    background-color: rgba(0, 0, 0, 0.9);
    color: #00ff00;
    font-family: monospace;
    font-size: 12px;
    z-index: 9999;
    display: none;
    flex-direction: column;
    border-top: 1px solid #555;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.5);
  `;
  
  // Add toggle button event listener
  toggleButton.addEventListener('click', () => {
    if (debugPanel.style.display === 'none') {
      debugPanel.style.display = 'flex';
      toggleButton.textContent = 'Hide Debug';
    } else {
      debugPanel.style.display = 'none';
      toggleButton.textContent = 'Show Debug';
    }
  });
  
  // Add header with controls
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    padding: 5px 10px;
    background-color: #333;
    border-bottom: 1px solid #555;
  `;
  
  // Title
  const title = document.createElement('div');
  title.textContent = '📊 WebRTC Debug Console';
  title.style.fontWeight = 'bold';
  
  // Controls
  const controls = document.createElement('div');
  
  // Clear button
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.cssText = `
    background: #444;
    color: white;
    border: 1px solid #666;
    border-radius: 3px;
    padding: 2px 8px;
    margin-right: 5px;
    cursor: pointer;
  `;
  clearBtn.onclick = clearDebugLogs;
  
  // Copy button
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy Logs';
  copyBtn.style.cssText = `
    background: #444;
    color: white;
    border: 1px solid #666;
    border-radius: 3px;
    padding: 2px 8px;
    margin-right: 5px;
    cursor: pointer;
  `;
  copyBtn.onclick = copyDebugLogs;
  
  // Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = 'Hide';
  toggleBtn.style.cssText = `
    background: #444;
    color: white;
    border: 1px solid #666;
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
  `;
  toggleBtn.onclick = () => {
    const content = document.getElementById('debug-content');
    const stats = document.getElementById('debug-stats');
    
    if (content.style.display === 'none') {
      content.style.display = 'block';
      stats.style.display = 'flex';
      toggleBtn.textContent = 'Hide';
      debugPanel.style.height = '300px';
    } else {
      content.style.display = 'none';
      stats.style.display = 'none';
      toggleBtn.textContent = 'Show';
      debugPanel.style.height = '30px';
    }
  };
  
  // Add all elements to header
  controls.appendChild(clearBtn);
  controls.appendChild(copyBtn);
  controls.appendChild(toggleBtn);
  header.appendChild(title);
  header.appendChild(controls);
  debugPanel.appendChild(header);
  
  // Create container for log messages
  const content = document.createElement('div');
  content.id = 'debug-content';
  content.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 5px 10px;
  `;
  debugPanel.appendChild(content);
  
  // Create container for connection stats
  const stats = document.createElement('div');
  stats.id = 'debug-stats';
  stats.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    padding: 5px 10px;
    background-color: #222;
    border-top: 1px solid #444;
    font-size: 11px;
  `;
  
  // Create sections for different stats
  const connectionSection = document.createElement('div');
  connectionSection.style.cssText = `margin-right: 20px;`;
  connectionSection.innerHTML = '<strong>CONNECTION:</strong> <div id="connection-state">Not connected</div>';
  
  const iceSection = document.createElement('div');
  iceSection.style.cssText = `margin-right: 20px;`;
  iceSection.innerHTML = '<strong>ICE CANDIDATES:</strong> <div id="ice-stats">None</div>';
  
  const mediaSection = document.createElement('div');
  mediaSection.style.cssText = `margin-right: 20px;`;
  mediaSection.innerHTML = '<strong>MEDIA:</strong> <div id="media-stats">No tracks</div>';
  
  const networkSection = document.createElement('div');
  networkSection.innerHTML = '<strong>NETWORK:</strong> <div id="network-stats">No data</div>';
  
  stats.appendChild(connectionSection);
  stats.appendChild(iceSection);
  stats.appendChild(mediaSection);
  stats.appendChild(networkSection);
  debugPanel.appendChild(stats);
  
  // Add to document
  document.body.appendChild(debugPanel);
  
  // Add initial message
  addDebugLog('Debug panel initialized', 'info');
}

// Add a message to the debug log
function addDebugLog(message, level = 'info') {
  // Create timestamp
  const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
  
  // Create log object
  const log = {
    timestamp,
    message,
    level
  };
  
  // Add to log array
  debugLogs.push(log);
  
  // Limit log size
  if (debugLogs.length > 1000) {
    debugLogs.shift();
  }
  
  // Update UI if available
  const content = document.getElementById('debug-content');
  if (content) {
    const entry = document.createElement('div');
    
    // Style based on level
    let color = '#0f0';
    let prefix = 'ℹ️';
    
    switch (level) {
      case 'error':
        color = '#f55';
        prefix = '❌';
        break;
      case 'warning':
        color = '#ff5';
        prefix = '⚠️';
        break;
      case 'success':
        color = '#5f5';
        prefix = '✅';
        break;
      case 'rtc':
        color = '#5ff';
        prefix = '🔌';
        break;
      case 'ice':
        color = '#f5f';
        prefix = '❄️';
        break;
      case 'media':
        color = '#5df';
        prefix = '📷';
        break;
      case 'info':
      default:
        color = '#0ff';
        prefix = 'ℹ️';
    }
    
    entry.style.cssText = `
      color: ${color};
      margin-bottom: 2px;
      display: flex;
    `;
    
    entry.innerHTML = `
      <span style="color: #999; min-width: 85px;">[${timestamp}]</span>
      <span style="margin-right: 5px;">${prefix}</span>
      <span>${message}</span>
    `;
    
    content.appendChild(entry);
    
    // Auto-scroll to bottom
    content.scrollTop = content.scrollHeight;
  }
}

// Clear all debug logs
function clearDebugLogs() {
  debugLogs = [];
  const content = document.getElementById('debug-content');
  if (content) {
    content.innerHTML = '';
  }
  addDebugLog('Logs cleared', 'info');
}

// Copy debug logs to clipboard
function copyDebugLogs() {
  const logText = debugLogs.map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`).join('\n');
  
  // Add connection stats
  const connectionState = document.getElementById('connection-state')?.textContent || 'Unknown';
  const iceStats = document.getElementById('ice-stats')?.textContent || 'Unknown';
  const mediaStats = document.getElementById('media-stats')?.textContent || 'Unknown';
  const networkStats = document.getElementById('network-stats')?.textContent || 'Unknown';
  
  const statsText = `
=== CONNECTION STATS ===
CONNECTION: ${connectionState}
ICE: ${iceStats}
MEDIA: ${mediaStats}
NETWORK: ${networkStats}
========================
`;
  
  const fullText = statsText + '\n\n' + logText;
  
  // Copy to clipboard
  navigator.clipboard.writeText(fullText)
    .then(() => {
      addDebugLog('Logs copied to clipboard', 'success');
    })
    .catch(err => {
      addDebugLog(`Failed to copy: ${err}`, 'error');
      
      // Fallback method
      const textarea = document.createElement('textarea');
      textarea.value = fullText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      addDebugLog('Logs copied using fallback method', 'success');
    });
}

// Intercept console logs to add to debug panel
function interceptConsoleLogs() {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info
  };
  
  console.log = function(...args) {
    originalConsole.log.apply(console, args);
    
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    // Filter out some noisy logs
    if (!message.includes('[object Object]')) {
      addDebugLog(message, 'info');
    }
  };
  
  console.warn = function(...args) {
    originalConsole.warn.apply(console, args);
    const message = args.map(arg => String(arg)).join(' ');
    addDebugLog(message, 'warning');
  };
  
  console.error = function(...args) {
    originalConsole.error.apply(console, args);
    const message = args.map(arg => String(arg)).join(' ');
    addDebugLog(message, 'error');
  };
  
  console.info = function(...args) {
    originalConsole.info.apply(console, args);
    const message = args.map(arg => String(arg)).join(' ');
    addDebugLog(message, 'info');
  };
}

// Start monitoring WebRTC stats
function startStatsMonitoring() {
  // Clear existing interval
  if (statsUpdateInterval) {
    clearInterval(statsUpdateInterval);
  }
  
  statsUpdateInterval = setInterval(async () => {
    if (!window.peerConnection) {
      updateConnectionStats(null);
      return;
    }
    
    try {
      const stats = await window.peerConnection.getStats();
      updateConnectionStats(stats);
    } catch (e) {
      console.error('Error getting stats:', e);
      updateConnectionStats(null);
    }
  }, 1000);
}

// Update the connection stats display
function updateConnectionStats(stats) {
  // Connection state
  const connectionState = document.getElementById('connection-state');
  if (connectionState) {
    if (!window.peerConnection) {
      connectionState.innerHTML = '<span style="color:#f55;">No connection</span>';
      return;
    }
    
    connectionState.innerHTML = `
      <div>ICE: <span style="color:#0f0;">${window.peerConnection.iceConnectionState || 'unknown'}</span></div>
      <div>Signal: <span style="color:#0f0;">${window.peerConnection.signalingState || 'unknown'}</span></div>
      <div>RTC: <span style="color:#0f0;">${window.peerConnection.connectionState || 'unknown'}</span></div>
    `;
  }
  
  // If no stats, stop here
  if (!stats) return;
  
  const iceStats = document.getElementById('ice-stats');
  const mediaStats = document.getElementById('media-stats');
  const networkStats = document.getElementById('network-stats');
  
  // Initialize containers for various stat types
  let inboundAudio = null;
  let inboundVideo = null;
  let outboundAudio = null;
  let outboundVideo = null;
  let activeCandidatePair = null;
  let localCandidates = [];
  let remoteCandidates = [];
  
  // Process each stat
  stats.forEach(stat => {
    // Collect stats by type
    if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
      inboundAudio = stat;
    } else if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
      inboundVideo = stat;
    } else if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
      outboundAudio = stat;
    } else if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
      outboundVideo = stat;
    } else if (stat.type === 'candidate-pair' && stat.selected) {
      activeCandidatePair = stat;
    } else if (stat.type === 'local-candidate') {
      localCandidates.push(stat);
    } else if (stat.type === 'remote-candidate') {
      remoteCandidates.push(stat);
    }
  });
  
  // Update media stats
  if (mediaStats) {
    // Build media stats HTML
    let mediaHtml = '';
    
    // Incoming audio
    if (inboundAudio) {
      mediaHtml += `<div>Incoming Audio: <span style="color:#5f5;">Active</span>`;
      if (inboundAudio.packetsLost) {
        mediaHtml += ` (${inboundAudio.packetsLost} packets lost)`;
      }
      mediaHtml += `</div>`;
    } else {
      mediaHtml += `<div>Incoming Audio: <span style="color:#f55;">Not detected</span></div>`;
    }
    
    // Incoming video
    if (inboundVideo) {
      mediaHtml += `<div>Incoming Video: <span style="color:#5f5;">Active</span>`;
      if (inboundVideo.frameWidth && inboundVideo.frameHeight) {
        mediaHtml += ` (${inboundVideo.frameWidth}x${inboundVideo.frameHeight})`;
      }
      mediaHtml += `</div>`;
    } else {
      mediaHtml += `<div>Incoming Video: <span style="color:#f55;">Not detected</span></div>`;
    }
    
    // Outgoing audio
    if (outboundAudio) {
      mediaHtml += `<div>Outgoing Audio: <span style="color:#5f5;">Sending</span></div>`;
    } else {
      mediaHtml += `<div>Outgoing Audio: <span style="color:#f55;">Not sending</span></div>`;
    }
    
    // Outgoing video
    if (outboundVideo) {
      mediaHtml += `<div>Outgoing Video: <span style="color:#5f5;">Sending</span>`;
      if (outboundVideo.frameWidth && outboundVideo.frameHeight) {
        mediaHtml += ` (${outboundVideo.frameWidth}x${outboundVideo.frameHeight})`;
      }
      mediaHtml += `</div>`;
    } else {
      mediaHtml += `<div>Outgoing Video: <span style="color:#f55;">Not sending</span></div>`;
    }
    
    mediaStats.innerHTML = mediaHtml;
  }
  
  // Update ICE candidate stats
  if (iceStats && activeCandidatePair) {
    // Find the related candidates
    const localCandidate = localCandidates.find(c => c.id === activeCandidatePair.localCandidateId);
    const remoteCandidate = remoteCandidates.find(c => c.id === activeCandidatePair.remoteCandidateId);
    
    let iceHtml = '';
    
    if (localCandidate) {
      iceHtml += `<div>Local: ${localCandidate.protocol.toUpperCase()} ${localCandidate.candidateType}`;
      if (localCandidate.ip) {
        iceHtml += ` (${localCandidate.ip}:${localCandidate.port})`;
      }
      iceHtml += `</div>`;
    }
    
    if (remoteCandidate) {
      iceHtml += `<div>Remote: ${remoteCandidate.protocol.toUpperCase()} ${remoteCandidate.candidateType}`;
      if (remoteCandidate.ip) {
        iceHtml += ` (${remoteCandidate.ip}:${remoteCandidate.port})`;
      }
      iceHtml += `</div>`;
    }
    
    if (activeCandidatePair.currentRoundTripTime) {
      const rttMs = Math.round(activeCandidatePair.currentRoundTripTime * 1000);
      iceHtml += `<div>Round Trip: ${rttMs}ms</div>`;
    }
    
    iceStats.innerHTML = iceHtml || '<div>No active candidates</div>';
  } else if (iceStats) {
    iceStats.innerHTML = '<div>No active connection</div>';
  }
  
  // Update network stats
  if (networkStats && activeCandidatePair) {
    let networkHtml = '';
    
    if (activeCandidatePair.bytesReceived) {
      const received = formatBytes(activeCandidatePair.bytesReceived);
      networkHtml += `<div>Received: ${received}</div>`;
    }
    
    if (activeCandidatePair.bytesSent) {
      const sent = formatBytes(activeCandidatePair.bytesSent);
      networkHtml += `<div>Sent: ${sent}</div>`;
    }
    
    if (inboundVideo && inboundVideo.framesReceived) {
      networkHtml += `<div>Frames: ${inboundVideo.framesReceived} received`;
      if (inboundVideo.framesDropped) {
        networkHtml += `, ${inboundVideo.framesDropped} dropped`;
      }
      networkHtml += `</div>`;
    }
    
    networkStats.innerHTML = networkHtml || '<div>No data available</div>';
  } else if (networkStats) {
    networkStats.innerHTML = '<div>No connection data</div>';
  }
}

// Format bytes to human-readable
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Add specific WebRTC event logging
function logWebRTCEvent(event, details = {}) {
  switch (event) {
    case 'ice-connection-state-change':
      addDebugLog(`ICE connection state: ${details.state}`, 'ice');
      break;
    case 'signaling-state-change':
      addDebugLog(`Signaling state: ${details.state}`, 'rtc');
      break;
    case 'connection-state-change':
      addDebugLog(`Connection state: ${details.state}`, 'rtc');
      break;
    case 'negotiation-needed':
      addDebugLog('Negotiation needed', 'rtc');
      break;
    case 'ice-candidate':
      addDebugLog(`ICE candidate: ${details.candidate ? details.candidate.type : 'null'}`, 'ice');
      break;
    case 'data-channel-state-change':
      addDebugLog(`Data channel: ${details.state}`, 'rtc');
      break;
    case 'track-added':
      addDebugLog(`Track added: ${details.kind}`, 'media');
      break;
    case 'track-removed':
      addDebugLog(`Track removed: ${details.kind}`, 'media');
      break;
    case 'offer-created':
      addDebugLog('Offer created', 'rtc');
      break;
    case 'answer-created':
      addDebugLog('Answer created', 'rtc');
      break;
    case 'local-description-set':
      addDebugLog('Local description set', 'rtc');
      break;
    case 'remote-description-set':
      addDebugLog('Remote description set', 'rtc');
      break;
    default:
      addDebugLog(`${event}: ${JSON.stringify(details)}`, 'rtc');
  }
}

// Enhanced WebRTC monitoring functions
function enhanceWebRTCMonitoring(peerConnection) {
  if (!peerConnection) return;
  
  // Monitor ICE connection state
  peerConnection.oniceconnectionstatechange = () => {
    logWebRTCEvent('ice-connection-state-change', { state: peerConnection.iceConnectionState });
    
    // Add detailed diagnostics for failed state
    if (peerConnection.iceConnectionState === 'failed') {
      addDebugLog('Connection FAILED - gathering diagnostics...', 'error');
      
      // Get current network information
      if (navigator.connection) {
        const netInfo = navigator.connection;
        addDebugLog(`Network type: ${netInfo.effectiveType}, downlink: ${netInfo.downlink}Mbps`, 'info');
      }
      
      // Recommend restart
      addDebugLog('Recommended action: Restart ICE connection', 'warning');
    }
  };
  
  // Monitor signaling state
  peerConnection.onsignalingstatechange = () => {
    logWebRTCEvent('signaling-state-change', { state: peerConnection.signalingState });
  };
  
  // Monitor connection state
  peerConnection.onconnectionstatechange = () => {
    logWebRTCEvent('connection-state-change', { state: peerConnection.connectionState });
  };
  
  // Monitor negotiation needed
  peerConnection.onnegotiationneeded = () => {
    logWebRTCEvent('negotiation-needed');
  };
  
  // Monitor ICE candidate events
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      logWebRTCEvent('ice-candidate', { 
        candidate: {
          type: event.candidate.type || 'unknown',
          protocol: event.candidate.protocol || 'unknown',
          address: event.candidate.address || 'unknown',
          port: event.candidate.port || 'unknown'
        }
      });
    } else {
      logWebRTCEvent('ice-gathering-complete');
    }
  };
  
  // Monitor tracks
  peerConnection.ontrack = (event) => {
    logWebRTCEvent('track-added', { kind: event.track.kind });
    
    // Monitor track ended events
    event.track.onended = () => {
      logWebRTCEvent('track-ended', { kind: event.track.kind });
    };
    
    // Monitor track muted events
    event.track.onmute = () => {
      logWebRTCEvent('track-muted', { kind: event.track.kind });
    };
    
    // Monitor track unmuted events
    event.track.onunmute = () => {
      logWebRTCEvent('track-unmuted', { kind: event.track.kind });
    };
  };
  
  addDebugLog('Enhanced WebRTC monitoring initialized', 'success');
}

// Export functions to global scope
window.WebRTCDebug = {
  init: initDebugSystem,
  log: addDebugLog,
  clearLogs: clearDebugLogs,
  copyLogs: copyDebugLogs,
  enhanceMonitoring: enhanceWebRTCMonitoring
};
