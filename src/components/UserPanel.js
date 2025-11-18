import React, { useState, useEffect, useRef } from 'react';
import './UserPanel.css';

const UserPanel = ({ 
  socket, 
  room, 
  partner, 
  userLanguage,
  userName,
  onSendMessage, 
  onSystemMessage,
  chatLog,
  onLeaveRoom
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mySpeech, setMySpeech] = useState('');
  const [translatedSpeech, setTranslatedSpeech] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(true);
  
  const speechRecognition = useRef(null);
  const speechSynthesis = useRef(window.speechSynthesis);
  const currentUtterance = useRef(null);

  useEffect(() => {
    initializeSpeechRecognition();
    
    // Listen for translated speech from partner
    if (socket) {
      const handleSpeechToSpeak = (data) => {
        console.log('🎧 Received translated speech:', data);
        
        if (data.senderId !== socket.id) { // Only process partner's speech
          // Display what you hear (translated version)
          setTranslatedSpeech(data.text);
          
          // Add to chat log
          addToChatLog({
            original: data.originalText,
            translated: data.text,
            sourceLang: data.sourceLang,
            targetLang: data.targetLang,
            isSent: false,
            senderId: data.senderId,
            timestamp: data.timestamp
          });
          
          // Auto-speak the translated text (what you hear)
          if (autoSpeak) {
            console.log('🔊 Speaking translated text:', data.text);
            speakText(data.text, userLanguage); // Speak in YOUR language
          }
          
          onSystemMessage(`You heard: "${data.text}"`);
        }
      };

      const handleSpeechSent = (data) => {
        console.log('✅ Your speech was sent:', data);
        addToChatLog({
          original: data.original,
          translated: data.translated,
          sourceLang: userLanguage,
          targetLang: data.targetLang,
          isSent: true,
          senderId: socket.id
        });
        onSystemMessage(`You said: "${data.original}"`);
      };

      socket.on('speech-to-speak', handleSpeechToSpeak);
      socket.on('speech-sent', handleSpeechSent);

      return () => {
        socket.off('speech-to-speak', handleSpeechToSpeak);
        socket.off('speech-sent', handleSpeechSent);
      };
    }
  }, [socket, autoSpeak, onSystemMessage, userLanguage]);

  const initializeSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      onSystemMessage('Speech recognition not supported in this browser. Try Chrome or Edge.');
      return;
    }

    speechRecognition.current = new SpeechRecognition();
    speechRecognition.current.continuous = true;
    speechRecognition.current.interimResults = true;
    speechRecognition.current.lang = getTTSLanguage(userLanguage);

    speechRecognition.current.onstart = () => {
      console.log('🎤 Started listening');
      setIsListening(true);
      setMySpeech('');
      setTranslatedSpeech('');
      onSystemMessage('Listening... Speak now!');
    };

    speechRecognition.current.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Update speech display in real-time
      const fullTranscript = (finalTranscript + interimTranscript).trim();
      setMySpeech(fullTranscript);

      // Send final transcripts immediately
      if (finalTranscript.trim()) {
        handleUserSpeech(finalTranscript.trim());
      }
    };

    speechRecognition.current.onerror = (event) => {
      console.error('Speech recognition error:', event);
      onSystemMessage(`Speech recognition error: ${event.error}`);
      stopListening();
    };

    speechRecognition.current.onend = () => {
      console.log('🛑 Stopped listening');
      setIsListening(false);
    };
  };

  const handleUserSpeech = (transcript) => {
    if (!socket || !room || !partner) {
      onSystemMessage('No partner connected');
      return;
    }

    console.log('🚀 Sending speech for translation:', transcript);

    // Send for translation to partner's language
    socket.emit('real-time-speech', {
      roomId: room.roomId,
      transcript: transcript,
      sourceLang: userLanguage, // Your language
      targetLang: partner.partnerLang // Partner's language
    });

    onSystemMessage(`Sending: "${transcript}"`);
  };

  const addToChatLog = (messageData) => {
    const message = {
      id: Date.now(),
      ...messageData,
      timestamp: messageData.timestamp || new Date()
    };
    onSendMessage(message);
  };

  const startListening = () => {
    if (!speechRecognition.current) return;
    
    if (!room || !partner) {
      onSystemMessage('Please wait for a partner to connect first');
      return;
    }

    speechRecognition.current.lang = getTTSLanguage(userLanguage);
    
    try {
      speechRecognition.current.start();
    } catch (error) {
      onSystemMessage('Failed to start speech recognition: ' + error.message);
    }
  };

  const stopListening = () => {
    if (speechRecognition.current && isListening) {
      speechRecognition.current.stop();
    }
  };

  const speakText = (text, lang) => {
    if (!text.trim()) return;

    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getTTSLanguage(lang);
    utterance.rate = 0.9;
    utterance.volume = 1.0;
    
    utterance.onstart = () => {
      console.log('🔊 Started speaking');
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      console.log('🔇 Finished speaking');
      setIsSpeaking(false);
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      setIsSpeaking(false);
    };

    currentUtterance.current = utterance;
    speechSynthesis.current.speak(utterance);
  };

  const stopSpeaking = () => {
    if (speechSynthesis.current.speaking) {
      speechSynthesis.current.cancel();
      setIsSpeaking(false);
    }
  };

  const getTTSLanguage = (langCode) => {
    const mapping = {
      'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE',
      'it': 'it-IT', 'ja': 'ja-JP', 'ko': 'ko-KR', 'zh': 'zh-CN',
      'ru': 'ru-RU', 'ar': 'ar-SA', 'hi': 'hi-IN', 'pt': 'pt-BR'
    };
    return mapping[langCode] || 'en-US';
  };

  const getLanguageName = (code) => {
    const names = {
      'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
      'it': 'Italian', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese',
      'ru': 'Russian', 'ar': 'Arabic', 'hi': 'Hindi', 'pt': 'Portuguese'
    };
    return names[code] || code;
  };

  return (
    <div className="single-user-panel">
      <div className="panel-header">
        <h2>🎤 Voice Translator</h2>
        <div className="user-info">
          <span>You: {userName} ({getLanguageName(userLanguage)})</span>
          {partner && (
            <span>Partner: {partner.partnerName} ({getLanguageName(partner.partnerLang)})</span>
          )}
          <button onClick={onLeaveRoom} className="leave-btn">Leave Room</button>
        </div>
      </div>

      {/* Speaking Section */}
      <div className="speaking-section">
        <h3>🎙️ Your Speech ({getLanguageName(userLanguage)})</h3>
        <div className="controls">
          <button 
            onClick={startListening} 
            disabled={isListening || !partner}
            className={`speak-btn ${isListening ? 'listening' : ''}`}
          >
            {isListening ? '🎤 Speaking...' : 'Start Speaking'}
          </button>
          <button 
            onClick={stopListening} 
            disabled={!isListening}
            className="stop-btn"
          >
            Stop
          </button>
        </div>
        
        <div className="speech-output">
          <div className="output-box">
            {mySpeech || 'Press "Start Speaking" and talk in your language...'}
          </div>
        </div>
      </div>

      {/* Listening Section */}
      <div className="listening-section">
        <h3>👂 You Hear ({getLanguageName(userLanguage)})</h3>
        <div className="status">
          {isSpeaking ? '🔊 Playing translation...' : 'Ready to hear translations'}
        </div>
        
        <div className="translation-output">
          <div className="output-box translated">
            {translatedSpeech || "You'll hear translated speech here..."}
          </div>
        </div>

        <div className="settings">
          <label>
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => setAutoSpeak(e.target.checked)}
            />
            Auto-play translated speech
          </label>
        </div>
      </div>

      {/* Conversation History */}
      <div className="conversation-history">
        <h3>💬 Conversation</h3>
        <div className="chat-messages">
          {chatLog.map((message) => (
            <div key={message.id} className={`message ${message.isSystem ? 'system' : message.isSent ? 'sent' : 'received'}`}>
              <div className="message-content">
                {message.isSystem ? (
                  <em>{message.text}</em>
                ) : message.isSent ? (
                  <div>
                    <strong>You said:</strong> {message.original}
                    <br />
                    <em>Sent as: {message.translated}</em>
                  </div>
                ) : (
                  <div>
                    <strong>You heard:</strong> {message.translated}
                    <br />
                    <em>Original: {message.original}</em>
                  </div>
                )}
              </div>
              <div className="message-time">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UserPanel;