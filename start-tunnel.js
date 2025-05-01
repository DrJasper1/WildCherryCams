const { exec } = require('child_process');
const readline = require('readline');

// Configuration
const LOCAL_PORT = 3001;

console.log('🚀 Starting video chat app with direct public URL...');
console.log('📡 This will create a public URL without password screens');

// Start the Node.js server
const serverProcess = exec('node index.js', { cwd: process.cwd() });

serverProcess.stdout.on('data', (data) => {
  console.log(`Server: ${data}`);
});

serverProcess.stderr.on('data', (data) => {
  console.error(`Server Error: ${data}`);
});

// Give the server a moment to start
setTimeout(() => {
  console.log('🔌 Setting up direct public access...');
  
  // Start the localhost.run tunnel 
  // This service often works without password screens
  const tunnelProcess = exec(`ssh -R 80:localhost:${LOCAL_PORT} nokey@localhost.run`, { cwd: process.cwd() });
  
  tunnelProcess.stdout.on('data', (data) => {
    console.log(data);
    
    // Extract the URL from the output
    if (data.includes('https://')) {
      const url = data.match(/(https:\/\/[^\s]+)/);
      if (url) {
        console.log(`\n🌐 PUBLIC URL: ${url[0]}`);
        console.log('📣 Share this URL with anyone - no password screens!');
        console.log('📝 The first person to connect will automatically become the host');
        console.log('⚠️ This URL will stay active as long as this program is running');
      }
    }
  });
  
  tunnelProcess.stderr.on('data', (data) => {
    console.error(`Tunnel Error: ${data}`);
  });
  
  // Handle cleanup on exit
  process.on('SIGINT', () => {
    console.log('Shutting down...');
    tunnelProcess.kill();
    serverProcess.kill();
    process.exit();
  });
  
}, 2000);

// Keep the process running
process.stdin.resume();
