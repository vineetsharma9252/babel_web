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
  const [autoSpeak, setAutoSpeak] = useState(true);
  
  const speechRecognition = useRef(null);
  const speechSynthesis = useRef(window.speechSynthesis);
  const currentUtterance = useRef(null);
  const recognitionTimeout = useRef(null);

  useEffect(() => {
    initializeSpeechRecognition();
    
    // Listen for speech that needs to be spoken
    if (socket) {
      const handleSpeechToSpeak = (data) => {
        console.log('🎧 Received speech to speak:', data);
        
        if (data.senderId !== socket.id) { // Only process partner's speech
          // Display the translated text
          setTranslatedOutput(data.text);
          
          // Add to chat log immediately
          addToChatLog({
            original: data.originalText,
            translated: data.text,
            sourceLang: data.sourceLang,
            targetLang: data.targetLang,
            isSent: false,
            senderId: data.senderId,
            timestamp: data.timestamp
          });
          
          // Auto-speak the translated text IMMEDIATELY
          if (autoSpeak) {
            console.log('🔊 Auto-speaking translated text:', data.text);
            speakText(data.text, data.targetLang);
          }
          
          onSystemMessage(`Partner: "${data.originalText}" → "${data.text}"`);
        }
      };

      const handleSpeechSent = (data) => {
        console.log('✅ Speech sent confirmation:', data);
        setTranslatedOutput(data.translated);
        addToChatLog({
          original: data.original,
          translated: data.translated,
          sourceLang: language,
          targetLang: data.targetLang,
          isSent: true,
          senderId: socket.id
        });
        onSystemMessage(`You said: "${data.original}" → "${data.translated}"`);
      };

      socket.on('speech-to-speak', handleSpeechToSpeak);
      socket.on('speech-sent', handleSpeechSent);

      return () => {
        socket.off('speech-to-speak', handleSpeechToSpeak);
        socket.off('speech-sent', handleSpeechSent);
      };
    }
  }, [socket, autoSpeak, onSystemMessage, language]);

  const initializeSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      onSystemMessage('Speech recognition not supported in this browser. Try Chrome or Edge.');
      return;
    }

    speechRecognition.current = new SpeechRecognition();
    speechRecognition.current.continuous = true;
    speechRecognition.current.interimResults = true;
    speechRecognition.current.lang = getTTSLanguage(language);

    speechRecognition.current.onstart = () => {
      console.log('🎤 Speech recognition STARTED');
      setIsListening(true);
      setSpeechOutput('');
      setTranslatedOutput('');
      onSystemMessage('Started listening... Speak now!');
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

      // Update speech output display in real-time
      const fullTranscript = (finalTranscript + interimTranscript).trim();
      setSpeechOutput(fullTranscript);

      // Handle final transcripts IMMEDIATELY
      if (finalTranscript.trim()) {
        console.log('🎯 Final speech detected, sending immediately:', finalTranscript.trim());
        handleUserSpeech(finalTranscript.trim());
        
        // Clear interim results after sending final
        setSpeechOutput(finalTranscript.trim());
      }
    };

    speechRecognition.current.onerror = (event) => {
      console.error('Speech recognition error:', event);
      onSystemMessage(`Speech recognition error: ${event.error}`);
      stopListening();
    };

    speechRecognition.current.onend = () => {
      console.log('🛑 Speech recognition ended');
      setIsListening(false);
    };
  };

  const handleUserSpeech = (transcript) => {
    if (!socket || !room || !partner) {
      onSystemMessage('No partner connected. Speech will not be sent.');
      return;
    }

    console.log('🚀 Sending real-time speech:', transcript);

    // Determine target language - always translate to partner's language
    const targetLang = partner.partnerLang;
    const sourceLang = language;

    // Send for IMMEDIATE translation and delivery
    socket.emit('real-time-speech', {
      roomId: room.roomId,
      transcript: transcript,
      sourceLang: sourceLang,
      targetLang: targetLang
    });

    // Show immediate feedback
    setTranslatedOutput('Translating...');
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
    utterance.rate = 0.9;
    utterance.volume = 1.0;
    utterance.pitch = 1.0;
    
    utterance.onstart = () => {
      console.log('🔊 Speech synthesis started');
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      console.log('🔇 Speech synthesis ended');
      setIsSpeaking(false);
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      setIsSpeaking(false);
    };

    currentUtterance.current = utterance;
    
    try {
      speechSynthesis.current.speak(utterance);
      console.log('✅ Speak method called successfully');
    } catch (error) {
      console.error('❌ Speak method failed:', error);
    }
  };

  const stopSpeaking = () => {
    if (speechSynthesis.current.speaking) {
      speechSynthesis.current.cancel();
      setIsSpeaking(false);
    }
  };

  const testInstantTranslation = () => {
    if (!socket || !room || !partner) {
      onSystemMessage('Need partner connection to test');
      return;
    }

    const testPhrases = {
      'user1': ['Hello, how are you?', 'What is your name?', 'Thank you very much'],
      'user2': ['Hola, ¿cómo estás?', '¿Cómo te llamas?', 'Muchas gracias']
    };

    const testText = testPhrases[userType]?.[0] || 'Test message';
    console.log('🧪 Testing instant translation:', testText);
    
    const targetLang = partner.partnerLang;
    
    socket.emit('real-time-speech', {
      roomId: room.roomId,
      transcript: testText,
      sourceLang: language,
      targetLang: targetLang
    });
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
    <div className={`user-panel ${userType}`}>
      <h2>
        <span className={`user-indicator ${userType}-indicator`}></span>
        {title} ({getLanguageName(language)})
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
          <option value="pt">Portuguese</option>
        </select>
        
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
        
        <button 
          onClick={testInstantTranslation}
          disabled={!partner}
          className="test-btn"
        >
          Test Translation
        </button>
      </div>

      <div className={`status ${isListening ? 'listening' : isSpeaking ? 'speaking' : 'idle'}`}>
        {isListening ? '🎤 Listening... Speak now!' : 
         isSpeaking ? '🔊 Speaking translation...' : 
         'Ready for conversation'}
      </div>

      {/* Real-time Speech Output */}
      <div className="output-section">
        <label>Your Speech (Real-time):</label>
        <div className="output-box original-speech">
          {speechOutput || 'Start speaking... your words appear here instantly'}
        </div>
      </div>

      {/* Translated Output */}
      <div className="output-section">
        <label>Translated Speech:</label>
        <div className="output-box translated-speech">
          {translatedOutput || 'Translation will appear here instantly'}
        </div>
      </div>

      <div className="settings">
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
          <p>🎯 <strong>Instant Translation Active</strong></p>
          <p>Your {getLanguageName(language)} → Partner's {getLanguageName(partner.partnerLang)}</p>
          <p>Partner's {getLanguageName(partner.partnerLang)} → Your {getLanguageName(language)}</p>
        </div>
      )}

      {/* Quick phrases for testing */}
      {partner && (
        <div className="quick-phrases">
          <h4>💬 Try saying:</h4>
          <div className="phrase-buttons">
            {userType === 'user1' ? (
              <>
                <button onClick={() => setSpeechOutput('Hello, how are you?')}>Hello, how are you?</button>
                <button onClick={() => setSpeechOutput('What is your name?')}>What is your name?</button>
                <button onClick={() => setSpeechOutput('Thank you')}>Thank you</button>
              </>
            ) : (
              <>
                <button onClick={() => setSpeechOutput('Hola, ¿cómo estás?')}>Hola, ¿cómo estás?</button>
                <button onClick={() => setSpeechOutput('¿Cómo te llamas?')}>¿Cómo te llamas?</button>
                <button onClick={() => setSpeechOutput('Gracias')}>Gracias</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserPanel;