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

  const speechRecognition = useRef(null);
  const speechSynthesis = useRef(window.speechSynthesis);
  const currentUtterance = useRef(null);

  useEffect(() => {
    initializeSpeechRecognition();

    // Listen for messages (these will already be translated by server)
    if (socket) {
      const handleReceiveMessage = (data) => {
        // This is where we receive TRANSLATED messages from server
        if (data.senderId !== socket.id && data.shouldSpeak) {
          console.log("🔊 Receiving translated message to speak:", {
            message: data.message,
            language: data.translatedLang,
            fromLanguage: data.originalLang,
          });
          
          // Speak the TRANSLATED message
          if (speechEnabled) {
            speakText(data.message, data.translatedLang);
          }
        }
        
        // Add to chat log for display
        const isOwnMessage = data.senderId === socket.id;
        onSendMessage({
          text: isOwnMessage ? data.message : data.message,
          lang: data.translatedLang,
          isSent: isOwnMessage,
          senderId: data.senderId,
          isOwnMessage: isOwnMessage,
          shouldSpeak: data.shouldSpeak,
          originalMessage: data.originalMessage,
        });
      };

      socket.on("receive-message", handleReceiveMessage);

      return () => {
        socket.off("receive-message", handleReceiveMessage);
      };
    }
  }, [socket, speechEnabled, onSendMessage]);

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

    console.log("🎤 User speaking in their language:", {
      text: transcript,
      language: language,
      userType: userType,
    });

    // Add message to local chat immediately
    onSendMessage({
      text: transcript,
      lang: language,
      isSent: userType === "user1",
      senderId: socket.id,
      isOwnMessage: true,
      shouldSpeak: false,
    });

    // Send to server - Server will handle translation to partner's language
    socket.emit("send-message", {
      roomId: room.roomId,
      message: transcript,
      originalLang: language,
      // Server will determine the target language based on partner
      translatedLang: partner ? partner.partnerLang : "en",
      senderId: socket.id,
    });

    // Send speech data for real-time display
    socket.emit("speech-data", {
      roomId: room.roomId,
      transcript: transcript,
      language: language,
    });
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
      console.log(`🔊 Speaking in ${lang}: "${text}"`);
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

  const sendManualMessage = () => {
    const text = speechOutput.trim();
    if (!text) return;
    
    handleUserSpeech(text);
    setSpeechOutput("");
  };

  return (
    <div className={`user-panel ${userType}`}>
      <h2>
        <span className={`user-indicator ${userType}-indicator`}></span>
        {title}
        <span className="language-badge">{getLanguageName(language)}</span>
      </h2>

      <div className="controls">
        <select
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            onSystemMessage(`Language changed to ${getLanguageName(e.target.value)}`);
          }}
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
        {isSpeaking && <span className="speaking-language"> in {getLanguageName(language)}</span>}
      </div>

      <div className="output-box">
        <textarea
          value={speechOutput}
          onChange={(e) => setSpeechOutput(e.target.value)}
          placeholder={
            userType === "user1"
              ? "Speak or type your message..."
              : "Will show translated messages from partner..."
          }
          rows="3"
          className="speech-input"
        />
        {userType === "user1" && speechOutput.trim() && (
          <button onClick={sendManualMessage} className="send-btn">
            📤 Send (will be translated to partner's language)
          </button>
        )}
      </div>

      {userType === "user2" && partner && (
        <div className="partner-info">
          <p>
            <strong>Translation Setup:</strong>
          </p>
          <p>
            Partner speaks: <strong>{getLanguageName(partner.partnerLang)}</strong>
          </p>
          <p>
            You will hear: <strong>{getLanguageName(language)}</strong>
          </p>
          <p className="translation-flow">
            Partner's {getLanguageName(partner.partnerLang)} → Your {getLanguageName(language)}
          </p>
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
              <span className="message-meta">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {message.isOwnMessage 
                  ? " (you in " + getLanguageName(message.lang) + ")"
                  : " (translated to " + getLanguageName(message.lang) + ")"
                }
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UserPanel;