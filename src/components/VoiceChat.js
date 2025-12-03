import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import RoomManager from "./RoomManager";
import UserPanel from "./UserPanel";
import "./VoiceChat.css";

const VoiceChat = () => {
  const [socket, setSocket] = useState(null);
  const [room, setRoom] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatLog, setChatLog] = useState([]);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  
  const speechSynthesisRef = useRef(window.speechSynthesis);
  const isSpeakingRef = useRef(false);

  useEffect(() => {
    // Initialize socket connection
    const serverUrl =
      process.env.REACT_APP_SERVER_URL || "http://localhost:3001";
    console.log("Server Url: ", serverUrl);
    console.log("Connecting to server:", serverUrl);

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
      setPartner(null); // Reset partner when joining new room
      setChatLog([]); // Clear chat log when joining new room
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
        shouldSpeak: data.shouldSpeak
      });

      // Only speak if it's NOT our own message AND shouldSpeak is true AND speech is enabled
      if (!isOwnMessage && data.shouldSpeak && speechEnabled) {
        console.log('🔊 Speaking partner message:', data.message);
        
        // Use translated message if available, otherwise use original
        const textToSpeak = data.message || data.originalMessage;
        const langToUse = data.translatedLang || data.originalLang || 'en-US';
        
        speakText(textToSpeak, langToUse);
      }
    });

    newSocket.on("partner-speech", (data) => {
      console.log("🎤 Partner speech:", data);
      // This will be handled in UserPanel component
    });

    newSocket.on("translation-result", (data) => {
      console.log("🔄 Translation result:", data);
      
      // If this translation is for speech, speak it
      if (data.isForSpeech && speechEnabled) {
        speakText(data.translated, data.targetLang);
      }
    });

    newSocket.on("speak-text", (data) => {
      if (speechEnabled) {
        console.log("🔊 Speaking text from server:", data.text);
        speakText(data.text, data.language);
      }
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
  const speakText = (text, lang = 'en-US') => {
    if (!speechEnabled || !text.trim() || isSpeakingRef.current) return;
    
    try {
      isSpeakingRef.current = true;
      
      // Cancel any ongoing speech
      speechSynthesisRef.current.cancel();
      
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
      
      speechSynthesisRef.current.speak(utterance);
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
    setSpeechEnabled(prev => {
      const newValue = !prev;
      if (!newValue) {
        stopAllSpeech();
      }
      addSystemMessage(`Speech ${newValue ? 'enabled' : 'disabled'}`);
      return newValue;
    });
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
      addSystemMessage("Left the room");
    }
  };

  return (
    <div className="voice-chat-container">
      <div className="header">
        <h1>🌍 Multilingual Voice Chat</h1>
        <p>Real-time P2P Communication - Works Across Devices!</p>
        <div className="connection-status">
          Status: {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
          {socket && <span> | ID: {socket.id}</span>}
          <span className="speech-status">
            Speech: {speechEnabled ? '🔊 ON' : '🔇 OFF'}
          </span>
        </div>
      </div>

      {/* Speech Toggle */}
      <div className="speech-toggle-bar">
        <button 
          onClick={toggleSpeech}
          className={`speech-toggle-btn ${speechEnabled ? 'enabled' : 'disabled'}`}
        >
          {speechEnabled ? '🔊 Disable Speech' : '🔇 Enable Speech'}
        </button>
        <span className="speech-info">
          {speechEnabled ? 'You will hear partner messages' : 'Speech is disabled'}
        </span>
      </div>

      <RoomManager
        socket={socket}
        room={room}
        partner={partner}
        onSystemMessage={addSystemMessage}
        onLeaveRoom={handleLeaveRoom}
      />

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
                }`}
              >
                <div className="message-header">
                  <span className="message-sender">
                    {message.isSystem
                      ? "System"
                      : message.isOwnMessage
                      ? "You"
                      : "Partner"}
                  </span>
                  <span className="message-time">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="message-content">{message.text}</div>
                {!message.isSystem && message.lang && (
                  <div className="message-meta">
                    Language: {getLanguageName(message.lang)}
                    {message.isOwnMessage && !message.shouldSpeak && (
                      <span className="no-speech-indicator"> (no speech)</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
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
              <strong>Messages:</strong> {messages.length}
            </p>
            <p>
              <strong>Chat Log:</strong> {chatLog.length} messages
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