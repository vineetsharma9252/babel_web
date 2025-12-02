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

  useEffect(() => {
    // Initialize socket connection
    const serverUrl = "http://localhost:3001";
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
      addChatMessage({
        text: data.message,
        lang: data.translatedLang,
        isSent: data.senderId === newSocket.id,
        senderId: data.senderId,
        timestamp: new Date(data.timestamp),
      });
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
    };
  }, []);

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
        </div>
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
                    : message.isSent
                    ? "sent"
                    : "received"
                }`}
              >
                <div className="message-content">{message.text}</div>
                <div className="message-meta">
                  {message.isSystem
                    ? "System"
                    : message.isSent
                    ? "You"
                    : "Partner"}{" "}
                  •{message.timestamp.toLocaleTimeString()}
                </div>
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
          </div>
        </details>
      </div>
    </div>
  );
};

export default VoiceChat;
