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
    const newSocket = io(serverUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to server');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    });

    newSocket.on('joined-room', (data) => {
      setRoom(data);
      console.log('Joined room:', data);
    });

    newSocket.on('partner-joined', (data) => {
      setPartner(data);
      addSystemMessage(`Partner joined! They speak ${getLanguageName(data.partnerLang)}`);
    });

    newSocket.on('partner-left', () => {
      setPartner(null);
      addSystemMessage('Partner left the room');
    });

    newSocket.on('receive-message', (data) => {
      addMessage({
        text: data.message,
        lang: data.translatedLang,
        isSent: false,
        timestamp: new Date(data.timestamp)
      });
    });

    newSocket.on('partner-speech', (data) => {
      // Handle partner's speech data
      console.log('Partner speech:', data);
    });

    newSocket.on('translation-result', (data) => {
      // Handle translation results
      console.log('Translation result:', data);
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
      alert(error.message);
    });

    // Check for room in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId && newSocket) {
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

  return (
    <div className="voice-chat-container">
      <div className="header">
        <h1>🌍 Multilingual Voice Chat</h1>
        <p>Real-time P2P Communication - Works Across Devices!</p>
        <div className="connection-status">
          Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
      </div>

      <RoomManager 
        socket={socket}
        room={room}
        partner={partner}
        onSystemMessage={addSystemMessage}
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
    </div>
  );
};

export default VoiceChat;