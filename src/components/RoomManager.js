import React, { useState } from "react";
import "./RoomManager.css";

const RoomManager = ({
  socket,
  room,
  partner,
  onSystemMessage,
  onLeaveRoom,
}) => {
  const [roomCode, setRoomCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const createRoom = async () => {
    if (!socket || isCreating) return;

    setIsCreating(true);
    try {
      const serverUrl = process.env.REACT_APP_SERVER_URL || "http://localhost:3001";
      console.log("Creating room...");

      const response = await fetch(`${serverUrl}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      console.log("Room creation response:", data);

      if (data.success) {
        socket.emit("join-room", {
          roomId: data.roomId,
          userLang: "en",
          userName: "User",
        });

        onSystemMessage(`Room created: ${data.roomId}`);
      } else {
        throw new Error("Failed to create room");
      }
    } catch (error) {
      console.error("Failed to create room:", error);
      onSystemMessage("Failed to create room: " + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const joinRoom = () => {
    if (!socket || !roomCode.trim() || isJoining) return;

    setIsJoining(true);
    const roomId = roomCode.trim().toUpperCase();
    console.log("Joining room:", roomId);

    socket.emit("join-room", {
      roomId: roomId,
      userLang: "es",
      userName: "Partner",
    });

    // Reset joining state after a delay
    setTimeout(() => setIsJoining(false), 2000);
  };

  const copyRoomLink = () => {
    if (!room) return;

    const link = `${window.location.origin}${window.location.pathname}?room=${room.roomId}`;
    navigator.clipboard
      .writeText(link)
      .then(() => {
        alert("Room link copied to clipboard!");
      })
      .catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = link;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        alert("Room link copied to clipboard!");
      });
  };

  const copyRoomCode = () => {
    if (!room) return;

    navigator.clipboard
      .writeText(room.roomId)
      .then(() => {
        alert("Room code copied to clipboard!");
      })
      .catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = room.roomId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        alert("Room code copied to clipboard!");
      });
  };

  return (
    <div className="room-manager">
      <div className="room-info">
        <h2>Chat Room</h2>
        <div className="room-status">
          <span
            className={`status-indicator ${
              room ? "connected" : "disconnected"
            }`}
          >
            {room ? "🟢 In Room" : "🔴 No Room"}
          </span>
          <span className="user-count">
            {room ? `${partner ? 2 : 1} users connected` : "0 users connected"}
          </span>
        </div>

        <div className="room-controls">
          {!room ? (
            <>
              <button
                onClick={createRoom}
                disabled={!socket || isCreating}
                className="primary-btn"
              >
                {isCreating ? "Creating..." : "Create New Room"}
              </button>
              <div className="join-section">
                <input
                  type="text"
                  placeholder="Enter room code (e.g., ABC123)"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && joinRoom()}
                  className="room-code-input"
                  disabled={!socket || isJoining}
                />
                <button
                  onClick={joinRoom}
                  disabled={!socket || !roomCode.trim() || isJoining}
                  className="secondary-btn"
                >
                  {isJoining ? "Joining..." : "Join Room"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="room-sharing">
                <h4>
                  Room Code:{" "}
                  <strong className="room-code">{room.roomId}</strong>
                </h4>
                <p className="room-instructions">
                  {!partner 
                    ? "Share this code with your partner. You'll hear their messages spoken automatically."
                    : "Chat is active! You'll hear your partner's messages spoken."}
                </p>
                <div className="sharing-buttons">
                  <button onClick={copyRoomLink} className="secondary-btn">
                    📋 Copy Invite Link
                  </button>
                  <button onClick={copyRoomCode} className="secondary-btn">
                    🔢 Copy Code
                  </button>
                  <button onClick={onLeaveRoom} className="danger-btn">
                    🚪 Leave Room
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {room && !partner && (
          <div className="waiting-partner">
            <div className="waiting-spinner"></div>
            <p>⏳ Waiting for partner to join...</p>
            <p>
              Share this code:{" "}
              <strong className="room-code">{room.roomId}</strong>
            </p>
            <p className="share-instructions">
              Send the code or link to your friend to start chatting!
            </p>
          </div>
        )}

        {room && partner && (
          <div className="partner-connected">
            <div className="connected-badge">✅</div>
            <p>
              <strong>Partner connected!</strong>
            </p>
            <p>
              They speak: <strong>{partner.partnerLang}</strong>
            </p>
            <p className="chat-tip">
              Tip: Your partner's messages will be spoken automatically. You won't hear your own messages.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomManager;