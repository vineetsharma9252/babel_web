import React, { useState, useEffect, useRef } from 'react';
import './UserPanel.css';

const UserPanel = ({ 
  socket, 
  room, 
  partner, 
  userType, 
  title, 
  defaultLang, 
  onSendMessage, 
  onSystemMessage 
}) => {
  const [language, setLanguage] = useState(defaultLang);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechOutput, setSpeechOutput] = useState('');
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  
  const speechRecognition = useRef(null);
  const speechSynthesis = useRef(window.speechSynthesis);
  const currentUtterance = useRef(null);

  useEffect(() => {
    initializeSpeechRecognition();
    
    // Listen for partner's speech
    if (socket) {
      const handlePartnerSpeech = (data) => {
        if (userType === 'user2' && data.senderId !== socket.id) {
          console.log('🎤 Received partner speech:', data);
          setSpeechOutput(data.transcript);
          if (autoSpeak) {
            speakText(data.transcript, data.language);
          }
        }
      };

      socket.on('partner-speech', handlePartnerSpeech);

      return () => {
        socket.off('partner-speech', handlePartnerSpeech);
      };
    }
  }, [socket, userType, autoSpeak]);

  const initializeSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      onSystemMessage('Speech recognition not supported in this browser. Try Chrome or Edge.');
      return;
    }

    speechRecognition.current = new SpeechRecognition();
    speechRecognition.current.continuous = true;
    speechRecognition.current.interimResults = true;

    speechRecognition.current.onstart = () => {
      setIsListening(true);
      onSystemMessage('Started listening for speech');
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

      // Update speech output display
      setSpeechOutput(finalTranscript + interimTranscript);

      // Handle final transcripts
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
      setIsListening(false);
    };
  };

  const handleUserSpeech = (transcript) => {
    if (!socket || !room || !partner) {
      onSystemMessage('No partner connected. Speech will not be sent.');
      return;
    }

    console.log('🎤 Sending speech:', transcript);

    // Add message to local chat
    onSendMessage({
      text: transcript,
      lang: language,
      isSent: userType === 'user1'
    });

    // Send to partner via socket
    socket.emit('send-message', {
      roomId: room.roomId,
      message: transcript,
      originalLang: language,
      translatedLang: userType === 'user1' ? partner.partnerLang : language
    });

    // Send speech data for real-time display
    socket.emit('speech-data', {
      roomId: room.roomId,
      transcript: transcript,
      language: language
    });

    // Auto-translate if enabled
    if (autoTranslate && userType === 'user1') {
      socket.emit('translation-request', {
        roomId: room.roomId,
        text: transcript,
        sourceLang: language,
        targetLang: partner.partnerLang
      });
    }

    // Auto-speak if enabled
    if (autoSpeak && userType === 'user1') {
      speakText(transcript, language);
    }
  };

  const startListening = () => {
    if (!speechRecognition.current) return;
    
    if (!room || !partner) {
      onSystemMessage('Please wait for a partner to connect first');
      return;
    }

    const ttsLang = getTTSLanguage(language);
    speechRecognition.current.lang = ttsLang;
    
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
    
    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
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
      'ru': 'ru-RU', 'ar': 'ar-SA', 'hi': 'hi-IN'
    };
    return mapping[langCode] || 'en-US';
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
    <div className={`user-panel ${userType}`}>
      <h2>
        <span className={`user-indicator ${userType}-indicator`}></span>
        {title}
      </h2>
      
      <div className="controls">
        <select 
          value={language} 
          onChange={(e) => setLanguage(e.target.value)}
          disabled={userType === 'user2' && !partner}
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
        </select>
        
        {userType === 'user1' && (
          <>
            <button 
              onClick={startListening} 
              disabled={isListening || !partner}
              className={`speak-btn ${isListening ? 'listening' : ''}`}
            >
              {isListening ? '🎤 Listening...' : 'Start Speaking'}
            </button>
            <button 
              onClick={stopListening} 
              disabled={!isListening}
              className="stop-btn"
            >
              Stop
            </button>
          </>
        )}
      </div>

      <div className={`status ${isListening ? 'listening' : isSpeaking ? 'speaking' : 'idle'}`}>
        {isListening ? '🎤 Listening...' : isSpeaking ? '🔊 Speaking...' : 'Ready'}
      </div>

      <div className="output-box">
        {speechOutput || (userType === 'user1' ? 'Your speech will appear here...' : "Partner's speech will appear here...")}
      </div>

      <div className="settings">
        {userType === 'user1' && (
          <div className="setting-item">
            <label>
              <input
                type="checkbox"
                checked={autoTranslate}
                onChange={(e) => setAutoTranslate(e.target.checked)}
              />
              Auto-translate my speech
            </label>
          </div>
        )}
        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => setAutoSpeak(e.target.checked)}
            />
            Auto-speak {userType === 'user1' ? 'my speech' : "partner's messages"}
          </label>
        </div>
      </div>

      {userType === 'user2' && partner && (
        <div className="partner-info">
          <p>Partner speaks: <strong>{getLanguageName(partner.partnerLang)}</strong></p>
        </div>
      )}
    </div>
  );
};

export default UserPanel;