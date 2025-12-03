import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import RoomManager from "./RoomManager";
import UserPanel from "./UserPanel";
import VideoChat from "./VideoChat"; // Make sure you have this component
import "./VoiceChat.css";

const VoiceChat = () => {
  const [socket, setSocket] = useState(null);
  const [room, setRoom] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatLog, setChatLog] = useState([]);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [showVideoChat, setShowVideoChat] = useState(false);
  const [videoRoomInfo, setVideoRoomInfo] = useState(null);
  const [isVideoAvailable, setIsVideoAvailable] = useState(false);

  const speechSynthesisRef = useRef(window.speechSynthesis);
  const isSpeakingRef = useRef(false);

  useEffect(() => {
    // Initialize socket connection
    const serverUrl =
      process.env.REACT_APP_SERVER_URL || "http://localhost:3001";

    const newSocket = io(serverUrl, {
      transports: ["websocket", "polling"],
      timeout: 10000,
    });

    setSocket(newSocket);

    newSocket.on("connect", () => {
      setIsConnected(true);
      console.log("✅ Connected to server with ID:", newSocket.id);
    });

    newSocket.on("disconnect", (reason) => {
      setIsConnected(false);
      console.log("❌ Disconnected from server:", reason);
    });

    newSocket.on("joined-room", (data) => {
      console.log("✅ Joined room:", data);
      setRoom(data);
      setPartner(null);
      setChatLog([]);
      setShowVideoChat(false);
      setVideoRoomInfo(null);
    });

    newSocket.on("partner-joined", (data) => {
      console.log("🤝 Partner joined:", data);
      setPartner(data);
      addSystemMessage(
        `Partner joined! They speak ${getLanguageName(data.partnerLang)}`
      );
    });

    newSocket.on("partner-left", (data) => {
      console.log("👋 Partner left:", data);
      setPartner(null);
      addSystemMessage("Partner left the room");
    });

    newSocket.on("receive-message", (data) => {
      console.log("📨 Received message:", data);

      const isOwnMessage = data.senderId === newSocket.id;

      addChatMessage({
        text: data.message,
        lang: data.translatedLang,
        isSent: isOwnMessage,
        senderId: data.senderId,
        timestamp: new Date(data.timestamp),
        isOwnMessage: isOwnMessage,
        shouldSpeak: data.shouldSpeak,
      });

      // Only speak if it's NOT our own message AND shouldSpeak is true AND speech is enabled
      if (!isOwnMessage && data.shouldSpeak && speechEnabled) {
        console.log("🔊 Speaking partner message:", data.message);

        const textToSpeak = data.message || data.originalMessage;
        const langToUse = data.translatedLang || data.originalLang || "en-US";

        speakText(textToSpeak, langToUse);
      }
    });

    // NEW: Video chat invitation
    newSocket.on("video-chat-invitation", (data) => {
      console.log("🎥 Video chat invitation:", data);
      setVideoRoomInfo(data);
      setIsVideoAvailable(true);

      if (room && room.isHost) {
        // Host can auto-join or show invitation
        addSystemMessage(
          `${data.initiatedByName} started a video chat. Click "Join Video Chat" to join.`
        );
      } else {
        addSystemMessage(`Video chat available. Room: ${data.videoRoomId}`);
      }
    });

    // NEW: Video chat ready
    newSocket.on("video-chat-ready", (data) => {
      console.log("🎥 Video chat ready:", data);
      setVideoRoomInfo(data);
      setShowVideoChat(true);
      addSystemMessage("Video chat started!");
    });

    // NEW: Video session available
    newSocket.on("video-session-available", (data) => {
      console.log("🎥 Video session available:", data);
      setIsVideoAvailable(true);
    });

    // NEW: Video participant updates
    newSocket.on("video-participant-joined", (data) => {
      console.log("🎥 Participant joined video:", data);
      addSystemMessage(`${data.userName} joined the video chat`);
    });

    newSocket.on("video-participant-left", (data) => {
      console.log("🎥 Participant left video:", data);
      addSystemMessage("A participant left the video chat");
    });

    // NEW: Video chat messages
    newSocket.on("video-chat-message", (data) => {
      console.log("📹 Video chat message:", data);

      addChatMessage({
        text: data.message,
        lang: data.translatedLang,
        isSent: data.senderId === newSocket.id,
        senderId: data.senderId,
        timestamp: new Date(data.timestamp),
        isOwnMessage: data.senderId === newSocket.id,
        shouldSpeak: data.senderId !== newSocket.id,
        fromVideoChat: true,
      });

      // Speak video chat messages from others
      if (data.senderId !== newSocket.id && speechEnabled) {
        speakText(data.message, data.translatedLang || "en-US");
      }
    });

    newSocket.on("partner-speech", (data) => {
      console.log("🎤 Partner speech:", data);
      // This will be handled in UserPanel component
    });

    newSocket.on("translation-result", (data) => {
      console.log("🔄 Translation result:", data);
      // Handle translation results if needed
    });

    newSocket.on("join-error", (error) => {
      console.error("❌ Join error:", error);
      alert(`Join failed: ${error.message}`);
    });

    newSocket.on("room-update", (data) => {
      console.log("🔄 Room update:", data);
    });

    // Check for room in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get("room");
    if (roomId && newSocket) {
      console.log("🔄 Auto-joining room from URL:", roomId);
      setTimeout(() => {
        newSocket.emit("join-room", {
          roomId: roomId,
          userLang: "en",
          userName: "User",
        });
      }, 1000);
    }

    return () => {
      if (newSocket) {
        console.log("🧹 Cleaning up socket connection");
        newSocket.close();
      }
      stopAllSpeech();
    };
  }, []);

  // Speech synthesis function
  const speakText = (text, lang = "en-US") => {
    if (!speechEnabled || !text.trim() || isSpeakingRef.current) return;

    try {
      isSpeakingRef.current = true;

      // Cancel any ongoing speech
      if (speechSynthesisRef.current) {
        speechSynthesisRef.current.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onend = () => {
        isSpeakingRef.current = false;
      };

      utterance.onerror = (error) => {
        console.error("🔊 Speech error:", error);
        isSpeakingRef.current = false;
      };

      if (speechSynthesisRef.current) {
        speechSynthesisRef.current.speak(utterance);
      }
      console.log(`🔊 Speaking: "${text}" in ${lang}`);
    } catch (error) {
      console.error("🔊 Speech synthesis failed:", error);
      isSpeakingRef.current = false;
    }
  };

  const stopAllSpeech = () => {
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current.cancel();
    }
    isSpeakingRef.current = false;
  };

  const toggleSpeech = () => {
    setSpeechEnabled((prev) => {
      const newValue = !prev;
      if (!newValue) {
        stopAllSpeech();
      }
      addSystemMessage(`Speech ${newValue ? "enabled" : "disabled"}`);
      return newValue;
    });
  };

  const startVideoChat = () => {
    if (!socket || !room) {
      alert("Please join a voice room first");
      return;
    }

    console.log("🎥 Starting video chat...");
    socket.emit("start-video-chat", {
      voiceRoomId: room.roomId,
    });
  };

  const joinVideoChat = () => {
    if (!socket || !videoRoomInfo) {
      alert("No video chat available");
      return;
    }

    console.log("🎥 Joining video chat...");
    socket.emit("join-video-chat", {
      videoRoomId: videoRoomInfo.videoRoomId,
    });
  };

  const stopVideoChat = () => {
    if (socket && videoRoomInfo) {
      socket.emit("leave-video-chat", {
        videoRoomId: videoRoomInfo.videoRoomId,
      });
    }
    setShowVideoChat(false);
    setVideoRoomInfo(null);
    setIsVideoAvailable(false);
    addSystemMessage("Left video chat");
  };

  const addSystemMessage = (text) => {
    const message = {
      id: Date.now(),
      text,
      isSystem: true,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, message]);
    setChatLog((prev) => [...prev, message]);
  };

  const addChatMessage = (messageData) => {
    const message = {
      id: Date.now(),
      ...messageData,
      timestamp: new Date(),
    };
    setChatLog((prev) => [...prev, message]);
  };

  const addMessage = (messageData) => {
    const message = {
      id: Date.now(),
      ...messageData,
      timestamp: new Date(),
    };
    setChatLog((prev) => [...prev, message]);
  };

  const getLanguageName = (code) => {
    const names = {
      en: "English",
      es: "Spanish",
      fr: "French",
      de: "German",
      it: "Italian",
      ja: "Japanese",
      ko: "Korean",
      zh: "Chinese",
      ru: "Russian",
      ar: "Arabic",
      hi: "Hindi",
    };
    return names[code] || code;
  };

  const handleLeaveRoom = () => {
    if (socket && room) {
      socket.emit("leave-room", { roomId: room.roomId });
      setRoom(null);
      setPartner(null);
      setChatLog([]);
      stopAllSpeech();
      stopVideoChat();
      addSystemMessage("Left the room");
    }
  };

  return (
    <div className="voice-chat-container">
      <div className="header">
        <h1>🌍 Multilingual Voice & Video Chat</h1>
        <p>Real-time P2P Communication with Video Support</p>
        <div className="connection-status">
          Status: {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
          {socket && <span> | ID: {socket.id}</span>}
          <span className="speech-status">
            Speech: {speechEnabled ? "🔊 ON" : "🔇 OFF"}
          </span>
        </div>
      </div>

      {/* Video Chat Section */}
      {showVideoChat && videoRoomInfo && (
        <div className="video-chat-section">
          <VideoChat
            roomId={videoRoomInfo.videoRoomId}
            appId={videoRoomInfo.appId}
            serverSecret={videoRoomInfo.serverSecret}
            onLeave={stopVideoChat}
            userName={room?.userName || "User"}
            socket={socket}
          />
        </div>
      )}

      {/* Voice Chat Section */}
      {(!showVideoChat || !videoRoomInfo) && (
        <>
          <div className="speech-toggle-bar">
            <button
              onClick={toggleSpeech}
              className={`speech-toggle-btn ${
                speechEnabled ? "enabled" : "disabled"
              }`}
            >
              {speechEnabled ? "🔊 Disable Speech" : "🔇 Enable Speech"}
            </button>
            <span className="speech-info">
              {speechEnabled
                ? "You will hear partner messages"
                : "Speech is disabled"}
            </span>
          </div>

          <RoomManager
            socket={socket}
            room={room}
            partner={partner}
            onSystemMessage={addSystemMessage}
            onLeaveRoom={handleLeaveRoom}
          />

          {/* Video Chat Controls */}
          {room && partner && !showVideoChat && (
            <div className="video-chat-controls">
              <h3>🎥 Video Chat</h3>
              <div className="video-control-buttons">
                <button onClick={startVideoChat} className="video-start-btn">
                  Start Video Chat
                </button>

                {isVideoAvailable && videoRoomInfo && (
                  <button onClick={joinVideoChat} className="video-join-btn">
                    Join Video Chat
                  </button>
                )}
              </div>
              {isVideoAvailable && !videoRoomInfo && (
                <p className="video-info">
                  Video chat will be available when partner joins
                </p>
              )}
            </div>
          )}

          {room && (
            <div className="chat-panels">
              <UserPanel
                socket={socket}
                room={room}
                partner={partner}
                userType="user1"
                title="You"
                defaultLang="en"
                onSendMessage={addMessage}
                onSystemMessage={addSystemMessage}
                chatLog={chatLog}
                speechEnabled={speechEnabled}
              />

              <UserPanel
                socket={socket}
                room={room}
                partner={partner}
                userType="user2"
                title="Partner"
                defaultLang="es"
                onSendMessage={addMessage}
                onSystemMessage={addSystemMessage}
                chatLog={chatLog}
                speechEnabled={speechEnabled}
              />
            </div>
          )}

          {/* Chat Log Display */}
          {room && (
            <div className="chat-log">
              <h3>💬 Chat History</h3>
              <div className="chat-messages">
                {chatLog.map((message) => (
                  <div
                    key={message.id}
                    className={`chat-message ${
                      message.isSystem
                        ? "system"
                        : message.isOwnMessage
                        ? "own"
                        : "partner"
                    } ${message.fromVideoChat ? "video-chat" : ""}`}
                  >
                    <div className="message-header">
                      <span className="message-sender">
                        {message.isSystem
                          ? "System"
                          : message.isOwnMessage
                          ? "You"
                          : "Partner"}
                        {message.fromVideoChat && " 🎥"}
                      </span>
                      <span className="message-time">
                        {message.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="message-content">{message.text}</div>
                    {!message.isSystem && message.lang && (
                      <div className="message-meta">
                        Language: {getLanguageName(message.lang)}
                        {message.isOwnMessage && !message.shouldSpeak && (
                          <span className="no-speech-indicator">
                            {" "}
                            (no speech)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Mode Toggle (when video chat is active) */}
      {showVideoChat && videoRoomInfo && (
        <div className="mode-toggle">
          <button onClick={stopVideoChat} className="mode-btn voice-mode-btn">
            🎤 Switch to Voice Only
          </button>
        </div>
      )}

      {/* Debug info */}
      <div className="debug-info">
        <details>
          <summary>Debug Info</summary>
          <div>
            <p>
              <strong>Socket:</strong>{" "}
              {socket ? `Connected (${socket.id})` : "Disconnected"}
            </p>
            <p>
              <strong>Room:</strong> {room ? room.roomId : "None"}
            </p>
            <p>
              <strong>Partner:</strong>{" "}
              {partner
                ? `${partner.partnerId} (${partner.partnerLang})`
                : "None"}
            </p>
            <p>
              <strong>Video Chat:</strong>{" "}
              {showVideoChat ? "Active" : "Inactive"}
            </p>
            <p>
              <strong>Video Available:</strong>{" "}
              {isVideoAvailable ? "Yes" : "No"}
            </p>
            <p>
              <strong>Speech Enabled:</strong> {speechEnabled ? "Yes" : "No"}
            </p>
          </div>
        </details>
      </div>
    </div>
  );
};

export default VoiceChat;
