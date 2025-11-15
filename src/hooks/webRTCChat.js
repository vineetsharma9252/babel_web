import React, { useState, useEffect } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import RoomManager from './RoomManager';
import UserPanel from './UserPanel';
import './WebRTCChat.css';

const WebRTCChat = () => {
  const [socket, setSocket] = useState(null);
  const [room, setRoom] = useState(null);
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  const {
    localStream,
    remoteStream,
    isMicMuted,
    isConnected,
    localAudioRef,
    remoteAudioRef,
    toggleMicrophone,
    cleanupWebRTC
  } = useWebRTC(socket, room, addSystemMessage);

  useEffect(() => {
    initializeSocket();

    return () => {
      if (socket) {
        socket.close();
      }
      cleanupWebRTC();
    };
  }, []);

  const initializeSocket = () => {
    const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';
    const newSocket = require('socket.io-client')(serverUrl, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      setIsSocketConnected(true);
      console.log('✅ Connected to MediaSoup server');
    });

    newSocket.on('disconnect', () => {
      setIsSocketConnected(false);
      console.log('❌ Disconnected from MediaSoup server');
    });

    newSocket.on('peer-joined', (data) => {
      console.log('🤝 Peer joined:', data);
      setPartner(data);
      addSystemMessage(`Partner joined! They speak ${getLanguageName(data.userLang)}`);
    });

    newSocket.on('peer-left', (data) => {
      console.log('👋 Peer left:', data);
      setPartner(null);
      addSystemMessage('Partner left the room');
    });

    newSocket.on('receive-message', (data) => {
      console.log('📨 Received message:', data);
      addMessage({
        text: data.message,
        lang: data.translatedLang,
        isSent: data.senderId === newSocket.id,
        timestamp: new Date(data.timestamp)
      });
    });

    newSocket.on('new-producer', (data) => {
      console.log('🎤 New audio producer:', data);
    });

    setSocket(newSocket);
  };

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
      socket.emit('leave-room');
      setRoom(null);
      setPartner(null);
      cleanupWebRTC();
      addSystemMessage('Left the room');
    }
  };

  return (
    <div className="webrtc-chat-container">
      <div className="header">
        <h1>🌍 Real-time Voice Chat (WebRTC)</h1>
        <p>High-quality audio communication with MediaSoup</p>
        <div className="connection-status">
          Socket: {isSocketConnected ? '🟢 Connected' : '🔴 Disconnected'} | 
          Audio: {isConnected ? '🟢 Connected' : '🟡 Connecting...'}
        </div>
      </div>

      <RoomManager 
        socket={socket}
        room={room}
        partner={partner}
        onSystemMessage={addSystemMessage}
        onLeaveRoom={handleLeaveRoom}
      />

      {/* Audio Controls */}
      {room && (
        <div className="audio-controls">
          <h3>🎤 Audio Controls</h3>
          <div className="control-buttons">
            <button 
              onClick={toggleMicrophone}
              className={`mic-btn ${isMicMuted ? 'muted' : ''}`}
            >
              {isMicMuted ? '🎤🔇 Microphone Muted' : '🎤 Microphone Active'}
            </button>
            <div className="audio-status">
              <span>Local Audio: {localStream ? '✅' : '❌'}</span>
              <span>Remote Audio: {remoteStream ? '✅' : '❌'}</span>
            </div>
          </div>
          
          {/* Hidden audio elements for playback */}
          <audio ref={localAudioRef} autoPlay muted className="hidden-audio" />
          <audio ref={remoteAudioRef} autoPlay className="hidden-audio" />
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
            isAudioConnected={isConnected}
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
            isAudioConnected={isConnected}
          />
        </div>
      )}

      {/* Connection Quality */}
      {isConnected && (
        <div className="quality-indicator">
          <div className="quality-bar">
            <div className="quality-level excellent"></div>
          </div>
          <span>Audio Quality: Excellent</span>
        </div>
      )}

      {/* Debug info */}
      <div className="debug-info">
        <details>
          <summary>WebRTC Debug Info</summary>
          <div>
            <p><strong>Socket ID:</strong> {socket?.id}</p>
            <p><strong>Room:</strong> {room?.roomId || 'None'}</p>
            <p><strong>Partner:</strong> {partner ? `${partner.peerId} (${partner.userLang})` : 'None'}</p>
            <p><strong>Local Stream:</strong> {localStream ? 'Active' : 'Inactive'}</p>
            <p><strong>Remote Stream:</strong> {remoteStream ? 'Active' : 'Inactive'}</p>
            <p><strong>Microphone:</strong> {isMicMuted ? 'Muted' : 'Active'}</p>
          </div>
        </details>
      </div>
    </div>
  );
};

export default WebRTCChat;