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
  const [chatLog, setChatLog] = useState([]);
  const [userLanguage, setUserLanguage] = useState('en');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    // Initialize socket connection
    const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';
    console.log('🔌 Connecting to server:', serverUrl);
    
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
      setRoom({
        roomId: data.roomId,
        peers: data.peers
      });
      
      // Find partner from peers (exclude self)
      const partnerPeer = data.peers.find(peer => peer.partnerId !== newSocket.id);
      setPartner(partnerPeer || null);
      
      setChatLog([]);
      addSystemMessage(`Joined room: ${data.roomId}`);
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

    newSocket.on('speech-to-speak', (data) => {
      console.log('🎧 Received speech to speak:', data);
      // This will be handled in UserPanel component
    });

    newSocket.on('speech-sent', (data) => {
      console.log('✅ Speech sent confirmation:', data);
      // This will be handled in UserPanel component
    });

    newSocket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      addSystemMessage(`Error: ${error.message}`);
    });

    // Check for room in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId && newSocket) {
      console.log('🔄 Auto-joining room from URL:', roomId);
      setTimeout(() => {
        newSocket.emit('join-room', {
          roomId: roomId,
          userLang: userLanguage,
          userName: userName || 'User'
        });
      }, 1000);
    }

    return () => {
      if (newSocket) {
        console.log('🧹 Cleaning up socket connection');
        newSocket.disconnect();
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
    setChatLog(prev => [...prev, message]);
  };

  const addChatMessage = (messageData) => {
    const message = {
      id: Date.now(),
      ...messageData,
      timestamp: new Date()
    };
    setChatLog(prev => [...prev, message]);
  };

  const getLanguageName = (code) => {
    const names = {
      'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
      'it': 'Italian', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese',
      'ru': 'Russian', 'ar': 'Arabic', 'hi': 'Hindi', 'pt': 'Portuguese'
    };
    return names[code] || code;
  };

  const handleLeaveRoom = () => {
    if (socket && room) {
      socket.emit('leave-room');
      setRoom(null);
      setPartner(null);
      setChatLog([]);
      addSystemMessage('Left the room');
      
      // Remove room from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  const handleJoinRoom = (roomId, lang, name) => {
    if (socket) {
      setUserLanguage(lang);
      setUserName(name || 'User');
      socket.emit('join-room', {
        roomId: roomId,
        userLang: lang,
        userName: name || 'User'
      });
    }
  };

  const handleCreateRoom = (lang, name) => {
    if (socket) {
      setUserLanguage(lang);
      setUserName(name || 'User');
      socket.emit('create-room', {
        userLang: lang,
        userName: name || 'User'
      });
    }
  };

  return (
    <div className="voice-chat-container">
      <div className="header">
        <h1>🌍 Real-time Voice Translator</h1>
        <p>Speak in your language, hear translations instantly</p>
        <div className="connection-status">
          Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          {socket && <span> | ID: {socket.id}</span>}
        </div>
      </div>

      {!room ? (
        <div className="setup-panel">
          <div className="user-setup">
            <h2>Join Conversation</h2>
            <div className="setup-form">
              <div className="form-group">
                <label>Your Name:</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="name-input"
                />
              </div>
              <div className="form-group">
                <label>Your Language:</label>
                <select 
                  value={userLanguage} 
                  onChange={(e) => setUserLanguage(e.target.value)}
                  className="language-select"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="it">Italian</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                  <option value="zh">Chinese</option>
                  <option value="ru">Russian</option>
                  <option value="ar">Arabic</option>
                  <option value="hi">Hindi</option>
                  <option value="pt">Portuguese</option>
                </select>
              </div>
            </div>
          </div>

          <RoomManager 
            socket={socket}
            room={room}
            partner={partner}
            onSystemMessage={addSystemMessage}
            onLeaveRoom={handleLeaveRoom}
            onJoinRoom={handleJoinRoom}
            onCreateRoom={handleCreateRoom}
            userLanguage={userLanguage}
            userName={userName}
          />
        </div>
      ) : (
        <div className="conversation-panel">
          <UserPanel
            socket={socket}
            room={room}
            partner={partner}
            userLanguage={userLanguage}
            userName={userName}
            onSendMessage={addChatMessage}
            onSystemMessage={addSystemMessage}
            chatLog={chatLog}
            onLeaveRoom={handleLeaveRoom}
          />
        </div>
      )}

      {/* Connection debug info */}
      <div className="debug-info">
        <details>
          <summary>Connection Info</summary>
          <div>
            <p><strong>Socket:</strong> {socket ? `Connected (${socket.id})` : 'Disconnected'}</p>
            <p><strong>Room:</strong> {room ? room.roomId : 'None'}</p>
            <p><strong>Partner:</strong> {partner ? `${partner.partnerId} (${getLanguageName(partner.partnerLang)})` : 'None'}</p>
            <p><strong>Your Language:</strong> {getLanguageName(userLanguage)}</p>
          </div>
        </details>
      </div>
    </div>
  );
};

export default VoiceChat;