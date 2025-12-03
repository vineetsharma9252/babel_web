import React, { useState, useEffect, useRef } from "react";
import { ZegoUIKitPrebuilt } from "@zegocloud/zego-uikit-prebuilt";
import "./VideoChat.css";

const VideoChat = ({ 
  roomId, 
  onLeave, 
  userName = "User", 
  socket, // Added socket prop
  appId, // Added appId prop (optional since we have hardcoded values)
  serverSecret // Added serverSecret prop (optional)
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [participants, setParticipants] = useState([]);

  const containerRef = useRef(null);
  const zpRef = useRef(null);

  // Use props if provided, otherwise use hardcoded values
  const appID = appId || 88211358;
  const serverSecretValue = serverSecret || "9b8df477a18bc7ad4ce1d29542921aa9";
  const userID = Math.floor(Math.random() * 10000) + "";
  const displayName = userName || `User${userID}`;

  useEffect(() => {
    if (!roomId || isInitialized || !containerRef.current) return;

    initializeVideoChat();

    return () => {
      cleanupVideoChat();
    };
  }, [roomId, isInitialized]);

  useEffect(() => {
    // Listen for socket events from video chat
    if (socket) {
      const handleVideoMessage = (data) => {
        console.log("Video chat message:", data);
        // You can show video chat messages in a notification or chat panel
        showVideoChatNotification(`${data.senderName}: ${data.message}`);
      };

      const handleVideoControl = (data) => {
        console.log("Video control:", data);
        // Show notification when someone mutes/unmutes
        if (data.controlType === 'microphone') {
          showVideoChatNotification(
            `${data.senderName} ${data.value ? 'unmuted' : 'muted'} their microphone`
          );
        } else if (data.controlType === 'camera') {
          showVideoChatNotification(
            `${data.senderName} ${data.value ? 'turned on' : 'turned off'} their camera`
          );
        }
      };

      const handleVideoSpeechData = (data) => {
        console.log("Video speech data:", data);
        // Handle speech data from video chat
        // You could show a speech bubble or transcript
        showSpeechTranscript(data.transcript, data.senderName);
      };

      socket.on("video-chat-message", handleVideoMessage);
      socket.on("video-control-update", handleVideoControl);
      socket.on("video-speech-data", handleVideoSpeechData);

      return () => {
        socket.off("video-chat-message", handleVideoMessage);
        socket.off("video-control-update", handleVideoControl);
        socket.off("video-speech-data", handleVideoSpeechData);
      };
    }
  }, [socket]);

  const showVideoChatNotification = (message) => {
    // You can implement a toast notification system here
    console.log("📹 Video Chat Notification:", message);
    // For now, just log to console
  };

  const showSpeechTranscript = (transcript, senderName) => {
    console.log(`🎤 ${senderName}: ${transcript}`);
    // You could show this in a speech bubble UI
  };

  const initializeVideoChat = async () => {
    try {
      // Generate token
      const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
        appID,
        serverSecretValue,
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
        maxUsers: 4,
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
        onJoinRoom: () => {
          console.log("✅ Successfully joined video room:", roomId);
          // Notify server that we've joined video chat
          if (socket) {
            // You might want to emit an event to your server
            socket.emit("video-room-joined", { roomId });
          }
        },
        onLeaveRoom: () => {
          console.log("👋 Left video room:", roomId);
          // Notify server that we've left video chat
          if (socket) {
            socket.emit("video-room-left", { roomId });
          }
        },
      });

      // Set up event listeners for Zego
      zp.on("roomStateChanged", (state) => {
        console.log("Room state changed:", state);
        setIsJoined(state === "CONNECTED");
      });

      zp.on("userJoin", (users) => {
        console.log("User joined:", users);
        updateParticipants();
        
        // Notify server about user join
        if (socket && users.length > 0) {
          const newUser = users[0];
          socket.emit("video-user-joined", {
            roomId,
            userId: newUser.userID,
            userName: newUser.userName
          });
        }
      });

      zp.on("userLeave", (users) => {
        console.log("User left:", users);
        updateParticipants();
        
        // Notify server about user leave
        if (socket && users.length > 0) {
          const leftUser = users[0];
          socket.emit("video-user-left", {
            roomId,
            userId: leftUser.userID
          });
        }
      });

      zp.on("localStreamUpdated", (stream) => {
        console.log("Local stream updated:", stream);
        setLocalStream(stream);
      });

      zp.on("remoteStreamUpdated", (streams) => {
        console.log("Remote streams updated:", streams);
        setRemoteStreams(streams);
      });

      // Listen to text chat messages from Zego
      zp.on("roomMessageReceived", (messages) => {
        console.log("Zego room messages:", messages);
        messages.forEach(message => {
          // Forward these messages to your server for translation
          if (socket && message.type === "text") {
            socket.emit("send-message", {
              roomId: roomId,
              message: message.message,
              originalLang: "en", // You might want to detect language
              translatedLang: "es", // Or get from user settings
              isVideoRoom: true
            });
          }
        });
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
      
      // Notify server about microphone toggle
      if (socket) {
        socket.emit("video-control", {
          videoRoomId: roomId,
          controlType: "microphone",
          value: newState
        });
      }
    }
  };

  const toggleCamera = () => {
    if (zpRef.current) {
      const newState = !isCameraOn;
      zpRef.current.camera.toggle(newState);
      setIsCameraOn(newState);
      
      // Notify server about camera toggle
      if (socket) {
        socket.emit("video-control", {
          videoRoomId: roomId,
          controlType: "camera",
          value: newState
        });
      }
    }
  };

  const toggleScreenShare = () => {
    if (zpRef.current) {
      zpRef.current.screenSharing.toggle();
    }
  };

  const sendVideoChatMessage = (message) => {
    if (zpRef.current && message.trim()) {
      // Send message through Zego's text chat
      zpRef.current.sendRoomMessage(message, "text");
      
      // Also send to your server for translation/speech
      if (socket) {
        socket.emit("send-message", {
          roomId: roomId,
          message: message,
          originalLang: "en", // You should get this from user settings
          translatedLang: "es", // You should get this from partner settings
          isVideoRoom: true
        });
      }
    }
  };

  const leaveVideoChat = () => {
    cleanupVideoChat();
    if (onLeave) onLeave();
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?videoRoom=${roomId}`;
    navigator.clipboard
      .writeText(link)
      .then(() => alert("Invite link copied to clipboard!"))
      .catch(() => alert("Failed to copy link"));
  };

  // Function to handle speech from video chat
  const handleVideoSpeech = (transcript, language = "en") => {
    if (socket && transcript.trim()) {
      socket.emit("speech-data", {
        roomId: roomId,
        transcript: transcript,
        language: language,
        isVideoRoom: true
      });
    }
  };

  return (
    <div className="video-chat-container">
      <div className="video-chat-header">
        <h2>🎥 Video Conference</h2>
        <div className="video-chat-info">
          <span className="room-id">Room: {roomId}</span>
          <span className="participants">
            Participants: {participants.length}
          </span>
          <span className="status">
            {isJoined ? "🟢 Connected" : "🟡 Connecting..."}
          </span>
        </div>
      </div>

      <div className="video-controls">
        <button
          onClick={toggleMicrophone}
          className={`control-btn ${isMicOn ? "active" : "muted"}`}
        >
          {isMicOn ? "🎤 Mic On" : "🎤🔇 Mic Off"}
        </button>
        <button
          onClick={toggleCamera}
          className={`control-btn ${isCameraOn ? "active" : "muted"}`}
        >
          {isCameraOn ? "📷 Camera On" : "📷🔴 Camera Off"}
        </button>
        <button onClick={toggleScreenShare} className="control-btn share-btn">
          🖥️ Share Screen
        </button>
        <button onClick={copyInviteLink} className="control-btn invite-btn">
          📋 Copy Invite
        </button>
        <button onClick={leaveVideoChat} className="control-btn leave-btn">
          🚪 Leave
        </button>
      </div>

      {/* Add a simple text input for sending messages */}
      <div className="video-chat-input">
        <input
          type="text"
          placeholder="Type a message for translation..."
          onKeyPress={(e) => {
            if (e.key === 'Enter' && e.target.value.trim()) {
              sendVideoChatMessage(e.target.value);
              e.target.value = '';
            }
          }}
          className="chat-input"
        />
        <button 
          onClick={() => {
            const input = document.querySelector('.chat-input');
            if (input && input.value.trim()) {
              sendVideoChatMessage(input.value);
              input.value = '';
            }
          }}
          className="send-message-btn"
        >
          Send
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
          <span className="stat-value">
            {localStream ? "✅ Active" : "❌ Inactive"}
          </span>
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
          <li>Type messages in the input above for translation</li>
        </ul>
      </div>
    </div>
  );
};

export default VideoChat;