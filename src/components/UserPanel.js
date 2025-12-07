import React, { useState, useEffect, useRef } from "react";
import "./UserPanel.css";

const UserPanel = ({
  socket,
  room,
  partner,
  userType,
  title,
  defaultLang,
  onSendMessage,
  onSystemMessage,
  chatLog,
  speechEnabled,
}) => {
  const [language, setLanguage] = useState(defaultLang);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechOutput, setSpeechOutput] = useState("");
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(userType === "user2"); // Only auto-speak partner messages by default
  const [translatedText, setTranslatedText] = useState("");

  const speechRecognition = useRef(null);
  const speechSynthesis = useRef(window.speechSynthesis);
  const currentUtterance = useRef(null);

  useEffect(() => {
    initializeSpeechRecognition();

    // Listen for partner's speech
    if (socket) {
      const handlePartnerSpeech = (data) => {
        if (userType === "user2" && data.senderId !== socket.id) {
          console.log("🎤 Received partner speech in UserPanel:", data);
          setSpeechOutput(data.transcript);
          
          // Only speak if autoSpeak is enabled AND speech is globally enabled
          if (autoSpeak && speechEnabled) {
            speakText(data.transcript, data.language);
          }

          // Add to chat log (this will be displayed but not spoken again)
          onSendMessage({
            text: data.transcript,
            lang: data.language,
            isSent: false,
            senderId: data.senderId,
            isOwnMessage: false,
            shouldSpeak: false // Partner's speech won't trigger speech again
          });
        }
      };

      // Listen for translation results
      const handleTranslationResult = (data) => {
        console.log("🔄 Translation result received:", data);
        setTranslatedText(data.translated);
        
        // If this translation is for speech, speak it
        if (data.isForSpeech && speechEnabled && !data.isOwnMessage) {
          speakText(data.translated, data.targetLang);
        }
        
        // Update the last message with translation
        if (data.original) {
          // You might want to update the chat log here
          onSystemMessage(`Translation: "${data.original}" → "${data.translated}"`);
        }
      };

      socket.on("partner-speech", handlePartnerSpeech);
      socket.on("translation-result", handleTranslationResult);

      return () => {
        socket.off("partner-speech", handlePartnerSpeech);
        socket.off("translation-result", handleTranslationResult);
      };
    }
  }, [socket, userType, autoSpeak, speechEnabled, onSendMessage, onSystemMessage]);

  const initializeSpeechRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      onSystemMessage(
        "Speech recognition not supported in this browser. Try Chrome or Edge."
      );
      return;
    }

    speechRecognition.current = new SpeechRecognition();
    speechRecognition.current.continuous = true;
    speechRecognition.current.interimResults = true;

    speechRecognition.current.onstart = () => {
      setIsListening(true);
      onSystemMessage("Started listening for speech");
    };

    speechRecognition.current.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
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
      console.error("Speech recognition error:", event);
      onSystemMessage(`Speech recognition error: ${event.error}`);
      stopListening();
    };

    speechRecognition.current.onend = () => {
      setIsListening(false);
    };
  };

  const handleUserSpeech = (transcript) => {
    if (!socket || !room) {
      onSystemMessage("No room connected. Speech will not be sent.");
      return;
    }

    console.log("🎤 Sending speech from UserPanel:", transcript);

    // Determine partner's language for translation
    let targetLanguage = "en"; // Default to English
    if (partner && partner.partnerLang) {
      targetLanguage = partner.partnerLang;
    } else if (userType === "user1") {
      // If no partner yet, default to Spanish for user1
      targetLanguage = "es";
    }

    // Add message to local chat immediately (won't be spoken)
    onSendMessage({
      text: transcript,
      lang: language,
      isSent: userType === "user1",
      senderId: socket.id,
      isOwnMessage: true, // Mark as own message
      shouldSpeak: false  // Don't speak own messages
    });

    // Send to ALL users in the room via socket
    // IMPORTANT: Send the message first
    socket.emit("send-message", {
      roomId: room.roomId,
      message: transcript,
      originalLang: language,
      translatedLang: targetLanguage,
      senderId: socket.id,
    });

    // Send speech data for real-time display to partner
    socket.emit("speech-data", {
      roomId: room.roomId,
      transcript: transcript,
      language: language,
    });

    // Auto-translate if enabled and we have a partner
    if (autoTranslate && partner) {
      console.log(`🔄 Requesting translation: ${language} → ${targetLanguage}`);
      socket.emit("translation-request", {
        roomId: room.roomId,
        text: transcript,
        sourceLang: language,
        targetLang: targetLanguage,
        isForSpeech: true
      });
    }
  };

  const startListening = () => {
    if (!speechRecognition.current) return;

    if (!room) {
      onSystemMessage("Please join a room first");
      return;
    }

    const ttsLang = getTTSLanguage(language);
    speechRecognition.current.lang = ttsLang;

    try {
      speechRecognition.current.start();
    } catch (error) {
      onSystemMessage("Failed to start speech recognition: " + error.message);
    }
  };

  const stopListening = () => {
    if (speechRecognition.current && isListening) {
      speechRecognition.current.stop();
    }
  };

  const speakText = (text, lang) => {
    if (!text.trim() || !speechEnabled) return;

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
      console.error("Speech synthesis error:", event);
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
      en: "en-US",
      es: "es-ES",
      fr: "fr-FR",
      de: "de-DE",
      it: "it-IT",
      ja: "ja-JP",
      ko: "ko-KR",
      zh: "zh-CN",
      ru: "ru-RU",
      ar: "ar-SA",
      hi: "hi-IN",
    };
    return mapping[langCode] || "en-US";
  };

  const getLanguageName = (code) => {
    const names = {
      en: "English",
      es: "Spanish",
      fr: "French",
      de: "German",
      it: "Italian",
      ja: "Japanese",
      ko: "Korean",
      zh: "Chinese",
      ru: "Russian",
      ar: "Arabic",
      hi: "Hindi",
    };
    return names[code] || code;
  };

  // Manual send message function
  const sendManualMessage = () => {
    const text = speechOutput.trim();
    if (!text) return;
    
    handleUserSpeech(text);
    setSpeechOutput("");
  };

  // Manual translation request
  const requestTranslation = () => {
    const text = speechOutput.trim();
    if (!text || !partner) return;
    
    console.log(`🔄 Manual translation request: ${language} → ${partner.partnerLang}`);
    
    socket.emit("translation-request", {
      roomId: room.roomId,
      text: text,
      sourceLang: language,
      targetLang: partner.partnerLang,
      isForSpeech: true
    });
    
    onSystemMessage(`Translating to ${getLanguageName(partner.partnerLang)}...`);
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
          disabled={userType === "user2" && !partner}
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

        {userType === "user1" && (
          <>
            <button
              onClick={startListening}
              disabled={isListening || !room}
              className={`speak-btn ${isListening ? "listening" : ""}`}
            >
              {isListening ? "🎤 Listening..." : "Start Speaking"}
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

      <div
        className={`status ${
          isListening ? "listening" : isSpeaking ? "speaking" : "idle"
        }`}
      >
        {isListening
          ? "🎤 Listening..."
          : isSpeaking
          ? "🔊 Speaking..."
          : "Ready"}
      </div>

      <div className="output-box">
        <textarea
          value={speechOutput}
          onChange={(e) => setSpeechOutput(e.target.value)}
          placeholder={
            userType === "user1"
              ? "Speak or type your message..."
              : "Partner's speech will appear here..."
          }
          rows="3"
          className="speech-input"
        />
        {userType === "user1" && (
          <div className="action-buttons">
            {speechOutput.trim() && (
              <>
                <button onClick={sendManualMessage} className="send-btn">
                  📤 Send
                </button>
                {partner && autoTranslate && (
                  <button onClick={requestTranslation} className="translate-btn">
                    🔄 Translate
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Translation Display */}
      {translatedText && (
        <div className="translation-box">
          <h4>Translation:</h4>
          <p className="translated-text">{translatedText}</p>
        </div>
      )}

      <div className="settings">
        {userType === "user1" && (
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
            Auto-speak{" "}
            {userType === "user1" ? "partner's messages" : "my speech"}
          </label>
        </div>
      </div>

      {userType === "user2" && partner && (
        <div className="partner-info">
          <p>
            Partner speaks:{" "}
            <strong>{getLanguageName(partner.partnerLang)}</strong>
          </p>
          {translatedText && (
            <p className="translation-info">
              Translated to: <strong>{getLanguageName(language)}</strong>
            </p>
          )}
        </div>
      )}

      {/* Recent messages preview */}
      <div className="recent-messages">
        <h4>Recent Messages:</h4>
        <div className="messages-list">
          {chatLog.slice(-3).map((message, index) => (
            <div
              key={index}
              className={`message-preview ${
                message.isOwnMessage ? "own" : "partner"
              }`}
            >
              <span className="message-text">{message.text}</span>
              <span className="message-time">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {message.isOwnMessage && " (you)"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UserPanel;