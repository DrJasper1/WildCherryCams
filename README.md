# Random Video Chat Application

A peer-to-peer random video chat application similar to Omegle, built with WebRTC, Socket.IO, and Express.

## Features

- Automatic matching with random users
- Video and audio communication
- Fallback to audio-only if no camera is available
- Controls for muting audio and hiding video
- "Next" button to find a new partner
- Mobile-responsive design

## Technology Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express
- **Real-time Communication**: Socket.IO (for signaling), WebRTC (for peer-to-peer connections)
- **Public Access**: localtunnel (to make local server accessible from the internet)

## How It Works

1. The server pairs users who connect to the application
2. WebRTC establishes a direct peer-to-peer connection between matched users
3. Video and audio are transmitted directly between users, not through the server
4. The server only facilitates the initial connection (signaling)

## How to Use

1. Open the application in two different browser windows or on two different devices
2. Grant permission to use camera and microphone when prompted
3. Wait to be automatically connected with another user
4. Use the control buttons to mute audio or hide video as needed
5. Click "Next" to disconnect and find a new partner

## Running the Application Locally

```bash
npm run dev
```

The server will start on port 3001 and create a local instance of the application.

## Deploying to Render (Free Tier)

This application is configured for easy deployment on Render's free tier:

1. Create a Render account at [render.com](https://render.com)
2. Push this code to a GitHub repository
3. In Render dashboard, click "New Web Service"
4. Connect your GitHub repository
5. Configure with these settings:
   - **Name**: video-chat-app (or your preferred name)
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

Render will automatically deploy your application and provide a public URL with no warning screens.

Note: The free tier will put your app to sleep after 15 minutes of inactivity. It will wake up automatically when someone visits.
