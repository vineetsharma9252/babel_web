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
  const [debugInfo, setDebugInfo] = useState('');
  
  const speechRecognition = useRef(null);
  const speechSynthesis = useRef(window.speechSynthesis);
  const currentUtterance = useRef(null);

  // Debug function
  const addDebug = (message) => {
    console.log(`🔍 [${userType}] ${message}`);
    setDebugInfo(prev => `${new Date().toLocaleTimeString()}: ${message}\n${prev}`);
  };

  useEffect(() => {
    addDebug(`Component mounted - Socket: ${!!socket}, Room: ${!!room}, Partner: ${!!partner}`);
    initializeSpeechRecognition();
    
    // Listen for translated speech from partner
    if (socket) {
      const handleTranslatedSpeech = (data) => {
        addDebug(`Received translated-speech event: ${JSON.stringify(data)}`);
        
        if (data.senderId !== socket.id) { // Only process partner's speech
          addDebug(`Processing partner speech: "${data.originalText}" -> "${data.translatedText}"`);
          
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
            addDebug(`Auto-speak enabled, speaking: "${data.translatedText}" in ${data.targetLang}`);
            speakText(data.translatedText, data.targetLang);
          } else {
            addDebug('Auto-speak disabled, not speaking');
          }
          
          onSystemMessage(`Partner spoke: "${data.originalText}" → "${data.translatedText}"`);
        }
      };

      const handleTranslationComplete = (data) => {
        addDebug(`Translation complete: "${data.original}" -> "${data.translated}"`);
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
      const error = 'Speech recognition not supported in this browser. Try Chrome or Edge.';
      addDebug(error);
      onSystemMessage(error);
      return;
    }

    speechRecognition.current = new SpeechRecognition();
    speechRecognition.current.continuous = true;
    speechRecognition.current.interimResults = true;
    speechRecognition.current.lang = getTTSLanguage(language);

    speechRecognition.current.onstart = () => {
      addDebug('Speech recognition STARTED');
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
      addDebug(`Speech result - Final: "${finalTranscript}", Interim: "${interimTranscript}"`);

      // Handle final transcripts
      if (finalTranscript.trim()) {
        addDebug(`Final speech detected: "${finalTranscript.trim()}"`);
        handleUserSpeech(finalTranscript.trim());
      }
    };

    speechRecognition.current.onerror = (event) => {
      addDebug(`Speech recognition ERROR: ${event.error}`);
      console.error('Speech recognition error:', event);
      onSystemMessage(`Speech recognition error: ${event.error}`);
      stopListening();
    };

    speechRecognition.current.onend = () => {
      addDebug('Speech recognition ENDED');
      setIsListening(false);
      onSystemMessage('Stopped listening');
    };

    addDebug('Speech recognition initialized');
  };

  const handleUserSpeech = (transcript) => {
    if (!socket) {
      const error = 'No socket connection';
      addDebug(error);
      onSystemMessage(error);
      return;
    }

    if (!room) {
      const error = 'No room joined';
      addDebug(error);
      onSystemMessage(error);
      return;
    }

    if (!partner) {
      const error = 'No partner connected. Speech will not be sent.';
      addDebug(error);
      onSystemMessage(error);
      return;
    }

    addDebug(`User spoke: "${transcript}"`);
    onSystemMessage(`You said: "${transcript}"`);

    // Determine target language based on user type
    const targetLang = userType === 'user1' ? (partner.partnerLang || 'es') : language;
    const sourceLang = language;

    addDebug(`Translation: ${sourceLang} -> ${targetLang}`);

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
      addDebug(`Sending translation request for: "${transcript}"`);
      socket.emit('speech-translation-request', {
        roomId: room.roomId,
        transcript: transcript,
        sourceLang: sourceLang,
        targetLang: targetLang
      });
    } else {
      // If no translation, send directly
      addDebug('Auto-translate disabled, sending original text');
      socket.emit('translated-speech', {
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
    addDebug('Start listening clicked');
    
    if (!speechRecognition.current) {
      const error = 'Speech recognition not initialized';
      addDebug(error);
      onSystemMessage(error);
      return;
    }
    
    if (!room) {
      const error = 'Please join a room first';
      addDebug(error);
      onSystemMessage(error);
      return;
    }

    if (!partner) {
      const error = 'Please wait for a partner to connect first';
      addDebug(error);
      onSystemMessage(error);
      return;
    }

    const ttsLang = getTTSLanguage(language);
    speechRecognition.current.lang = ttsLang;
    addDebug(`Setting recognition language to: ${ttsLang}`);
    
    try {
      speechRecognition.current.start();
      addDebug('Speech recognition start() called');
    } catch (error) {
      const errorMsg = `Failed to start speech recognition: ${error.message}`;
      addDebug(errorMsg);
      onSystemMessage(errorMsg);
    }
  };

  const stopListening = () => {
    addDebug('Stop listening clicked');
    if (speechRecognition.current && isListening) {
      speechRecognition.current.stop();
      addDebug('Speech recognition stop() called');
    }
  };

  const speakText = (text, lang) => {
    if (!text.trim()) {
      addDebug('speakText called with empty text');
      return;
    }

    addDebug(`Attempting to speak: "${text}" in ${lang}`);

    // Check if speech synthesis is available
    if (!speechSynthesis.current) {
      const error = 'Speech synthesis not available';
      addDebug(error);
      onSystemMessage(error);
      return;
    }

    // Stop any current speech
    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getTTSLanguage(lang);
    utterance.rate = 0.9; // Slightly slower for better comprehension
    utterance.volume = 1.0;
    utterance.pitch = 1.0;
    
    utterance.onstart = () => {
      addDebug('Speech synthesis STARTED');
      setIsSpeaking(true);
      onSystemMessage(`Speaking: "${text}"`);
    };

    utterance.onend = () => {
      addDebug('Speech synthesis ENDED');
      setIsSpeaking(false);
    };

    utterance.onerror = (event) => {
      addDebug(`Speech synthesis ERROR: ${event.error}`);
      console.error('Speech synthesis error:', event);
      setIsSpeaking(false);
      onSystemMessage(`Speech synthesis error: ${event.error}`);
    };

    currentUtterance.current = utterance;
    
    try {
      speechSynthesis.current.speak(utterance);
      addDebug('speak() method called successfully');
    } catch (error) {
      addDebug(`speak() method failed: ${error.message}`);
    }
  };

  const stopSpeaking = () => {
    addDebug('Stop speaking clicked');
    if (speechSynthesis.current.speaking) {
      speechSynthesis.current.cancel();
      setIsSpeaking(false);
      addDebug('Speech synthesis cancelled');
    }
  };

  const testSpeech = () => {
    addDebug('Manual test speech triggered');
    const testText = userType === 'user1' ? 'Hello, how are you?' : 'Hola, ¿cómo estás?';
    speakText(testText, language);
  };

  const getTTSLanguage = (langCode) => {
    const mapping = {
      'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE',
      'it': 'it-IT', 'ja': 'ja-JP', 'ko': 'ko-KR', 'zh': 'zh-CN',
      'ru': 'ru-RU', 'ar': 'ar-SA', 'hi': 'hi-IN', 'pt': 'pt-BR'
    };
    const result = mapping[langCode] || 'en-US';
    addDebug(`TTS Language mapping: ${langCode} -> ${result}`);
    return result;
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
    <div className={`user-panel ${userType}`}>
      <h2>
        <span className={`user-indicator ${userType}-indicator`}></span>
        {title}
      </h2>
      
      <div className="controls">
        <select 
          value={language} 
          onChange={(e) => {
            setLanguage(e.target.value);
            addDebug(`Language changed to: ${e.target.value}`);
          }}
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
          <option value="pt">Portuguese</option>
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
          Stop Listening
        </button>
        <button 
          onClick={stopSpeaking} 
          disabled={!isSpeaking}
          className="stop-speak-btn"
        >
          Stop Speaking
        </button>
        <button 
          onClick={testSpeech}
          className="test-btn"
        >
          Test Speech
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
              onChange={(e) => {
                setAutoTranslate(e.target.checked);
                addDebug(`Auto-translate: ${e.target.checked}`);
              }}
            />
            Auto-translate my speech
          </label>
        </div>
        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => {
                setAutoSpeak(e.target.checked);
                addDebug(`Auto-speak: ${e.target.checked}`);
              }}
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

      {/* Debug Information */}
      <div className="debug-section">
        <h4>Debug Info:</h4>
        <div className="debug-output">
          <pre>{debugInfo}</pre>
        </div>
        <div className="connection-info">
          <p><strong>Socket:</strong> {socket ? 'Connected' : 'Disconnected'}</p>
          <p><strong>Room:</strong> {room ? room.roomId : 'None'}</p>
          <p><strong>Partner:</strong> {partner ? `${partner.partnerId} (${partner.partnerLang})` : 'None'}</p>
          <p><strong>Speech Recognition:</strong> {speechRecognition.current ? 'Available' : 'Unavailable'}</p>
          <p><strong>Speech Synthesis:</strong> {speechSynthesis.current ? 'Available' : 'Unavailable'}</p>
        </div>
      </div>

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