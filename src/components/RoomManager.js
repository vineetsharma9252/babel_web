import React, { useState } from 'react';
import './RoomManager.css';

const RoomManager = ({ socket, room, partner, onSystemMessage }) => {
  const [roomCode, setRoomCode] = useState('');

  const createRoom = async () => {
    if (!socket) return;

    try {
      const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';
      const response = await fetch(`${serverUrl}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        socket.emit('join-room', {
          roomId: data.roomId,
          userLang: 'en',
          userName: 'User'
        });
        
        onSystemMessage(`Room created: ${data.roomId}`);
      }
    } catch (error) {
      console.error('Failed to create room:', error);
      onSystemMessage('Failed to create room');
    }
  };

  const joinRoom = () => {
    if (!socket || !roomCode.trim()) return;

    socket.emit('join-room', {
      roomId: roomCode.trim().toUpperCase(),
      userLang: 'es',
      userName: 'Partner'
    });
  };

  const leaveRoom = () => {
    if (!socket || !room) return;

    socket.emit('leave-room', { roomId: room.roomId });
    onSystemMessage('Left the room');
  };

  const copyRoomLink = () => {
    if (!room) return;
    
    const link = `${window.location.origin}${window.location.pathname}?room=${room.roomId}`;
    navigator.clipboard.writeText(link).then(() => {
      alert('Room link copied to clipboard!');
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Room link copied to clipboard!');
    });
  };

  const copyRoomCode = () => {
    if (!room) return;
    
    navigator.clipboard.writeText(room.roomId).then(() => {
      alert('Room code copied to clipboard!');
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = room.roomId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Room code copied to clipboard!');
    });
  };

  return (
    <div className="room-manager">
      <div className="room-info">
        <h2>Chat Room</h2>
        <div className="room-status">
          <span className={`status-indicator ${room ? 'connected' : 'disconnected'}`}>
            {room ? '🟢 In Room' : '🔴 No Room'}
          </span>
          <span className="user-count">
            {room ? `${partner ? 2 : 1} users connected` : '0 users connected'}
          </span>
        </div>

        <div className="room-controls">
          {!room ? (
            <>
              <button onClick={createRoom} className="primary-btn">
                Create New Room
              </button>
              <div className="join-section">
                <input
                  type="text"
                  placeholder="Enter room code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
                  className="room-code-input"
                />
                <button onClick={joinRoom} className="secondary-btn">
                  Join Room
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="room-sharing">
                <h4>Room Code: <strong>{room.roomId}</strong></h4>
                <div className="sharing-buttons">
                  <button onClick={copyRoomLink} className="secondary-btn">
                    Copy Invite Link
                  </button>
                  <button onClick={copyRoomCode} className="secondary-btn">
                    Copy Code
                  </button>
                  <button onClick={leaveRoom} className="danger-btn">
                    Leave Room
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {room && !partner && (
          <div className="waiting-partner">
            <p>⏳ Waiting for partner to join...</p>
            <p>Share the room code: <strong>{room.roomId}</strong></p>
            <p className="share-instructions">
              Send the code or link to your friend to start chatting!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomManager;