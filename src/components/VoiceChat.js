import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import RoomManager from './RoomManager';
import UserPanel from './UserPanel';
import './VoiceChat.css';

const VoiceChat = () => {
  const [socket, setSocket] = useState(null);
  const [room, setRoom] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    // Initialize socket connection
    const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';
    console.log('Connecting to server:', serverUrl);
    
    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000
    });
    
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('✅ Connected to server with ID:', newSocket.id);
    });

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      console.log('❌ Disconnected from server:', reason);
    });

    newSocket.on('joined-room', (data) => {
      console.log('✅ Joined room:', data);
      setRoom(data);
      setPartner(null); // Reset partner when joining new room
    });

    newSocket.on('partner-joined', (data) => {
      console.log('🤝 Partner joined:', data);
      setPartner(data);
      addSystemMessage(`Partner joined! They speak ${getLanguageName(data.partnerLang)}`);
    });

    newSocket.on('partner-left', (data) => {
      console.log('👋 Partner left:', data);
      setPartner(null);
      addSystemMessage('Partner left the room');
    });

    newSocket.on('receive-message', (data) => {
      console.log('📨 Received message:', data);
      addMessage({
        text: data.message,
        lang: data.translatedLang,
        isSent: false,
        timestamp: new Date(data.timestamp)
      });
    });

    newSocket.on('partner-speech', (data) => {
      console.log('🎤 Partner speech:', data);
    });

    newSocket.on('translation-result', (data) => {
      console.log('🔄 Translation result:', data);
    });

    newSocket.on('join-error', (error) => {
      console.error('❌ Join error:', error);
      alert(`Join failed: ${error.message}`);
    });

    newSocket.on('room-update', (data) => {
      console.log('🔄 Room update:', data);
    });

    // Check for room in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId && newSocket) {
      console.log('🔄 Auto-joining room from URL:', roomId);
      setTimeout(() => {
        newSocket.emit('join-room', {
          roomId: roomId,
          userLang: 'en',
          userName: 'User'
        });
      }, 1000);
    }

    return () => {
      if (newSocket) {
        console.log('🧹 Cleaning up socket connection');
        newSocket.close();
      }
    };
  }, []);

  const addSystemMessage = (text) => {
    const message = {
      id: Date.now(),
      text,
      isSystem: true,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, message]);
  };

  const addMessage = (messageData) => {
    const message = {
      id: Date.now(),
      ...messageData,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, message]);
  };

  const getLanguageName = (code) => {
    const names = {
      'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
      'it': 'Italian', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese',
      'ru': 'Russian', 'ar': 'Arabic', 'hi': 'Hindi'
    };
    return names[code] || code;
  };

  const handleLeaveRoom = () => {
    if (socket && room) {
      socket.emit('leave-room', { roomId: room.roomId });
      setRoom(null);
      setPartner(null);
      addSystemMessage('Left the room');
    }
  };

  return (
    <div className="voice-chat-container">
      <div className="header">
        <h1>🌍 Multilingual Voice Chat</h1>
        <p>Real-time P2P Communication - Works Across Devices!</p>
        <div className="connection-status">
          Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
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
          />
        </div>
      )}

      {/* Debug info */}
      <div className="debug-info">
        <details>
          <summary>Debug Info</summary>
          <div>
            <p><strong>Socket:</strong> {socket ? 'Connected' : 'Disconnected'}</p>
            <p><strong>Room:</strong> {room ? room.roomId : 'None'}</p>
            <p><strong>Partner:</strong> {partner ? partner.partnerId : 'None'}</p>
            <p><strong>Messages:</strong> {messages.length}</p>
          </div>
        </details>
      </div>
    </div>
  );
};

export default VoiceChat;