const Client = require('upnp-device-client');
const http = require('http');

// Configuration
const LOCAL_PORT = 3001;
const EXTERNAL_PORT = 3001;
const LEASE_DURATION = 7200; // 2 hours in seconds
const DESCRIPTION = 'Video Chat App';

// Create UPnP client
const client = new Client();

async function setupPortForwarding() {
  try {
    console.log('Discovering UPnP gateway...');
    
    // Get external IP
    client.getExternalIPAddress((err, ip) => {
      if (err) {
        console.error('Failed to get external IP:', err.message);
        return;
      }
      
      console.log(`Your external IP address is: ${ip}`);
      console.log(`Share this URL with others: http://${ip}:${EXTERNAL_PORT}`);
      
      // Set up port mapping
      console.log(`Setting up port forwarding: internal port ${LOCAL_PORT} to external port ${EXTERNAL_PORT}...`);
      
      client.addPortMapping({
        NewRemoteHost: '',
        NewExternalPort: EXTERNAL_PORT,
        NewProtocol: 'TCP',
        NewInternalPort: LOCAL_PORT,
        NewInternalClient: getLocalIP(),
        NewEnabled: 1,
        NewPortMappingDescription: DESCRIPTION,
        NewLeaseDuration: LEASE_DURATION
      }, (err) => {
        if (err) {
          console.error('Failed to set up port forwarding:', err.message);
          console.log('Your router might not support UPnP or it might be disabled.');
          return;
        }
        
        console.log('✅ Port forwarding configured successfully!');
        console.log(`🌐 Your video chat app is now publicly accessible at: http://${ip}:${EXTERNAL_PORT}`);
        console.log('⚠️ This URL will work without any password screens');
        console.log('⚠️ The port forwarding will expire after 2 hours');
        console.log('📝 Run this script again to renew the port forwarding');
      });
    });
  } catch (error) {
    console.error('Error setting up port forwarding:', error);
  }
}

// Get local IP address
function getLocalIP() {
  const interfaces = require('os').networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Run setup
setupPortForwarding();

// Clean up on exit
process.on('SIGINT', () => {
  console.log('Removing port mapping...');
  client.deletePortMapping({
    NewRemoteHost: '',
    NewExternalPort: EXTERNAL_PORT,
    NewProtocol: 'TCP'
  }, (err) => {
    if (err) {
      console.error('Failed to remove port mapping:', err.message);
    } else {
      console.log('Port mapping removed successfully');
    }
    process.exit();
  });
});
