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
  onSystemMessage,
  chatLog
}) => {
  const [language, setLanguage] = useState(defaultLang);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechOutput, setSpeechOutput] = useState('');
  const [translatedOutput, setTranslatedOutput] = useState('');
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  
  const speechRecognition = useRef(null);
  const speechSynthesis = useRef(window.speechSynthesis);
  const currentUtterance = useRef(null);

  useEffect(() => {
    initializeSpeechRecognition();
    
    // Listen for translated speech from partner
    if (socket) {
      const handleTranslatedSpeech = (data) => {
        if (data.senderId !== socket.id) { // Only process partner's speech
          console.log('🎧 Received translated speech:', data);
          
          // Display the translated text
          setTranslatedOutput(data.translatedText);
          
          // Add to chat log
          addToChatLog({
            original: data.originalText,
            translated: data.translatedText,
            sourceLang: data.sourceLang,
            targetLang: data.targetLang,
            isSent: false,
            senderId: data.senderId
          });
          
          // Auto-speak the translated text
          if (autoSpeak) {
            speakText(data.translatedText, data.targetLang);
          }
          
          onSystemMessage(`Partner spoke: "${data.originalText}" → "${data.translatedText}"`);
        }
      };

      const handleTranslationComplete = (data) => {
        console.log('✅ Translation complete:', data);
        setTranslatedOutput(data.translated);
        onSystemMessage(`Translated: "${data.original}" → "${data.translated}"`);
      };

      socket.on('translated-speech', handleTranslatedSpeech);
      socket.on('translation-complete', handleTranslationComplete);

      return () => {
        socket.off('translated-speech', handleTranslatedSpeech);
        socket.off('translation-complete', handleTranslationComplete);
      };
    }
  }, [socket, autoSpeak, onSystemMessage]);

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
      setSpeechOutput('');
      setTranslatedOutput('');
      onSystemMessage('Started listening for speech...');
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
      const fullTranscript = (finalTranscript + interimTranscript).trim();
      setSpeechOutput(fullTranscript);

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
      onSystemMessage('Stopped listening');
    };
  };

  const handleUserSpeech = (transcript) => {
    if (!socket || !room || !partner) {
      onSystemMessage('No partner connected. Speech will not be sent.');
      return;
    }

    console.log('🎤 User spoke:', transcript);
    onSystemMessage(`You said: "${transcript}"`);

    // Determine target language based on user type
    const targetLang = userType === 'user1' ? partner.partnerLang : language;
    const sourceLang = language;

    // Add original speech to chat log immediately
    addToChatLog({
      original: transcript,
      translated: 'Translating...',
      sourceLang: sourceLang,
      targetLang: targetLang,
      isSent: true,
      senderId: socket.id
    });

    // Send for translation and delivery to partner
    if (autoTranslate) {
      socket.emit('speech-translation-request', {
        roomId: room.roomId,
        transcript: transcript,
        sourceLang: sourceLang,
        targetLang: targetLang
      });
    } else {
      // If no translation, send directly
      socket.to(room.roomId).emit('translated-speech', {
        originalText: transcript,
        translatedText: transcript,
        sourceLang: sourceLang,
        targetLang: targetLang,
        senderId: socket.id
      });
    }
  };

  const addToChatLog = (messageData) => {
    const message = {
      id: Date.now(),
      ...messageData,
      timestamp: new Date()
    };
    onSendMessage(message);
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
    utterance.rate = 0.9; // Slightly slower for better comprehension
    
    utterance.onstart = () => {
      setIsSpeaking(true);
      onSystemMessage(`Speaking: "${text}"`);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      setIsSpeaking(false);
      onSystemMessage('Speech synthesis error: ' + event.error);
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
        <button 
          onClick={stopSpeaking} 
          disabled={!isSpeaking}
          className="stop-speak-btn"
        >
          Stop Speaking
        </button>
      </div>

      <div className={`status ${isListening ? 'listening' : isSpeaking ? 'speaking' : 'idle'}`}>
        {isListening ? '🎤 Listening...' : isSpeaking ? '🔊 Speaking...' : 'Ready'}
      </div>

      {/* Original Speech Output */}
      <div className="output-section">
        <label>Your Speech:</label>
        <div className="output-box original-speech">
          {speechOutput || 'Speak and your words will appear here...'}
        </div>
      </div>

      {/* Translated Output */}
      <div className="output-section">
        <label>Translated Speech:</label>
        <div className="output-box translated-speech">
          {translatedOutput || 'Translated text will appear here...'}
        </div>
      </div>

      <div className="settings">
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
        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => setAutoSpeak(e.target.checked)}
            />
            Auto-speak translated messages
          </label>
        </div>
      </div>

      {partner && (
        <div className="partner-info">
          <p>Partner speaks: <strong>{getLanguageName(partner.partnerLang)}</strong></p>
          <p>Your speech will be translated to: <strong>{getLanguageName(partner.partnerLang)}</strong></p>
        </div>
      )}

      {/* Recent messages preview */}
      <div className="recent-messages">
        <h4>Recent Conversation:</h4>
        <div className="messages-list">
          {chatLog.slice(-3).map((message, index) => (
            <div key={index} className={`message-preview ${message.isSent ? 'sent' : 'received'}`}>
              <div className="message-original">
                <strong>Original:</strong> {message.original}
              </div>
              <div className="message-translated">
                <strong>Translated:</strong> {message.translated}
              </div>
              <span className="message-time">{message.timestamp.toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UserPanel;