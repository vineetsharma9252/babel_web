import React, { useState, useEffect, useRef } from "react";
import { ZegoUIKitPrebuilt } from "@zegocloud/zego-uikit-prebuilt";
import "./VideoChat.css";

const VideoChat = ({ roomId, onLeave, userName = "User" }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [participants, setParticipants] = useState([]);
  
  const containerRef = useRef(null);
  const zpRef = useRef(null);

  // ZegoCloud Configuration
  const appID = 88211358; // Your App ID
  const serverSecret = "9b8df477a18bc7ad4ce1d29542921aa9"; // Your Server Secret
  const userID = Math.floor(Math.random() * 10000) + "";
  const displayName = userName || `User${userID}`;

  useEffect(() => {
    if (!roomId || isInitialized || !containerRef.current) return;

    initializeVideoChat();

    return () => {
      cleanupVideoChat();
    };
  }, [roomId, isInitialized]);

  const initializeVideoChat = async () => {
    try {
      // Generate token
      const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
        appID,
        serverSecret,
        roomId,
        userID,
        displayName
      );

      // Create instance
      const zp = ZegoUIKitPrebuilt.create(kitToken);
      zpRef.current = zp;

      // Join room
      zp.joinRoom({
        container: containerRef.current,
        scenario: {
          mode: ZegoUIKitPrebuilt.VideoConference,
        },
        turnOnMicrophoneWhenJoining: true,
        turnOnCameraWhenJoining: true,
        showMyCameraToggleButton: true,
        showMyMicrophoneToggleButton: true,
        showAudioVideoSettingsButton: true,
        showScreenSharingButton: true,
        showTextChat: true,
        showUserList: true,
        maxUsers: 4, // Limit to 4 for better performance
        showLayoutButton: true,
        sharedLinks: [
          {
            name: "Copy link",
            url:
              window.location.protocol +
              "//" +
              window.location.host +
              window.location.pathname +
              "?videoRoom=" +
              roomId,
          },
        ],
      });

      // Set up event listeners
      zp.on("roomStateChanged", (state) => {
        console.log("Room state changed:", state);
        setIsJoined(state === "CONNECTED");
      });

      zp.on("userJoin", (users) => {
        console.log("User joined:", users);
        updateParticipants();
      });

      zp.on("userLeave", (users) => {
        console.log("User left:", users);
        updateParticipants();
      });

      zp.on("localStreamUpdated", (stream) => {
        console.log("Local stream updated:", stream);
        setLocalStream(stream);
      });

      zp.on("remoteStreamUpdated", (streams) => {
        console.log("Remote streams updated:", streams);
        setRemoteStreams(streams);
      });

      setIsInitialized(true);
      setIsJoined(true);

    } catch (error) {
      console.error("Failed to initialize video chat:", error);
      alert("Failed to initialize video chat. Please check your connection.");
    }
  };

  const updateParticipants = () => {
    if (zpRef.current) {
      const userList = zpRef.current.getAllUsers();
      setParticipants(userList);
    }
  };

  const cleanupVideoChat = () => {
    if (zpRef.current) {
      zpRef.current.destroy();
      zpRef.current = null;
    }
    setIsInitialized(false);
    setIsJoined(false);
    setLocalStream(null);
    setRemoteStreams([]);
    setParticipants([]);
  };

  const toggleMicrophone = () => {
    if (zpRef.current) {
      const newState = !isMicOn;
      zpRef.current.microphone.toggle(newState);
      setIsMicOn(newState);
    }
  };

  const toggleCamera = () => {
    if (zpRef.current) {
      const newState = !isCameraOn;
      zpRef.current.camera.toggle(newState);
      setIsCameraOn(newState);
    }
  };

  const toggleScreenShare = () => {
    if (zpRef.current) {
      zpRef.current.screenSharing.toggle();
    }
  };

  const leaveVideoChat = () => {
    cleanupVideoChat();
    if (onLeave) onLeave();
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?videoRoom=${roomId}`;
    navigator.clipboard.writeText(link)
      .then(() => alert("Invite link copied to clipboard!"))
      .catch(() => alert("Failed to copy link"));
  };

  return (
    <div className="video-chat-container">
      <div className="video-chat-header">
        <h2>🎥 Video Conference</h2>
        <div className="video-chat-info">
          <span className="room-id">Room: {roomId}</span>
          <span className="participants">Participants: {participants.length}</span>
          <span className="status">{isJoined ? "🟢 Connected" : "🟡 Connecting..."}</span>
        </div>
      </div>

      <div className="video-controls">
        <button 
          onClick={toggleMicrophone}
          className={`control-btn ${isMicOn ? 'active' : 'muted'}`}
        >
          {isMicOn ? '🎤 Mic On' : '🎤🔇 Mic Off'}
        </button>
        <button 
          onClick={toggleCamera}
          className={`control-btn ${isCameraOn ? 'active' : 'muted'}`}
        >
          {isCameraOn ? '📷 Camera On' : '📷🔴 Camera Off'}
        </button>
        <button 
          onClick={toggleScreenShare}
          className="control-btn share-btn"
        >
          🖥️ Share Screen
        </button>
        <button 
          onClick={copyInviteLink}
          className="control-btn invite-btn"
        >
          📋 Copy Invite
        </button>
        <button 
          onClick={leaveVideoChat}
          className="control-btn leave-btn"
        >
          🚪 Leave
        </button>
      </div>

      <div ref={containerRef} className="video-container">
        {!isInitialized && (
          <div className="loading-video">
            <div className="spinner"></div>
            <p>Initializing video chat...</p>
          </div>
        )}
      </div>

      <div className="video-stats">
        <div className="stat-item">
          <span className="stat-label">Local Stream:</span>
          <span className="stat-value">{localStream ? "✅ Active" : "❌ Inactive"}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Remote Streams:</span>
          <span className="stat-value">{remoteStreams.length} active</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Participants:</span>
          <span className="stat-value">{participants.length} users</span>
        </div>
      </div>

      <div className="video-tips">
        <h4>💡 Tips:</h4>
        <ul>
          <li>Allow camera and microphone permissions when prompted</li>
          <li>Share the invite link with others to join</li>
          <li>Toggle camera/microphone using the buttons above</li>
          <li>Use the layout button to change video arrangement</li>
        </ul>
      </div>
    </div>
  );
};

export default VideoChat;