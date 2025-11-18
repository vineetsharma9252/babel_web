import React, { useState } from 'react';
import './RoomManager.css';

const RoomManager = ({ 
  socket, 
  room, 
  partner, 
  onSystemMessage, 
  onLeaveRoom,
  onJoinRoom,
  onCreateRoom,
  userLanguage,
  userName
}) => {
  const [roomCode, setRoomCode] = useState('');

  const createRoom = async () => {
    if (!socket) {
      onSystemMessage('Not connected to server');
      return;
    }

    try {
      onCreateRoom(userLanguage, userName);
    } catch (error) {
      onSystemMessage('Failed to create room: ' + error.message);
    }
  };

  const joinRoom = () => {
    if (!socket || !roomCode.trim()) return;

    const roomId = roomCode.trim().toUpperCase();
    onJoinRoom(roomId, userLanguage, userName);
  };

  const copyRoomLink = () => {
    if (!room) return;
    
    const link = `${window.location.origin}${window.location.pathname}?room=${room.roomId}`;
    navigator.clipboard.writeText(link).then(() => {
      alert('Room link copied to clipboard!');
    });
  };

  const copyRoomCode = () => {
    if (!room) return;
    
    navigator.clipboard.writeText(room.roomId).then(() => {
      alert('Room code copied to clipboard!');
    });
  };

  return (
    <div className="room-manager">
      <div className="room-info">
        <h2>Voice Chat Room</h2>
        
        {!room ? (
          <div className="room-creation">
            <div className="user-display">
              <p><strong>You:</strong> {userName} ({getLanguageName(userLanguage)})</p>
            </div>
            
            <div className="room-controls">
              <button 
                onClick={createRoom} 
                disabled={!socket}
                className="primary-btn"
              >
                Create New Room
              </button>
              
              <div className="join-section">
                <div className="join-input-group">
                  <input
                    type="text"
                    placeholder="Enter room code (e.g., ABC123)"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
                    className="room-code-input"
                    disabled={!socket}
                  />
                  <button 
                    onClick={joinRoom} 
                    disabled={!socket || !roomCode.trim()}
                    className="secondary-btn"
                  >
                    Join Room
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="active-room">
            <div className="room-header">
              <h3>Room: <span className="room-code">{room.roomId}</span></h3>
              <div className="user-status">
                <p><strong>You:</strong> {userName} ({getLanguageName(userLanguage)})</p>
                {partner && (
                  <p><strong>Partner:</strong> {partner.partnerName} ({getLanguageName(partner.partnerLang)})</p>
                )}
              </div>
            </div>
            
            <div className="room-sharing">
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

            {!partner && (
              <div className="waiting-partner">
                <p>⏳ Waiting for partner to join...</p>
                <p>Share this code: <strong className="room-code">{room.roomId}</strong></p>
              </div>
            )}

            {partner && (
              <div className="partner-connected">
                <p>✅ Partner connected! Start speaking below.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function
function getLanguageName(code) {
  const names = {
    'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
    'it': 'Italian', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese',
    'ru': 'Russian', 'ar': 'Arabic', 'hi': 'Hindi', 'pt': 'Portuguese'
  };
  return names[code] || code;
}

export default RoomManager;