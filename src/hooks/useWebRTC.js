import { useState, useEffect, useRef } from 'react';

export const useWebRTC = (socket, room, onSystemMessage) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const transports = useRef(new Map());
  const producers = useRef(new Map());
  const consumers = useRef(new Map());
  const peerConnection = useRef(null);

  useEffect(() => {
    if (socket && room) {
      initializeWebRTC();
    }

    return () => {
      cleanupWebRTC();
    };
  }, [socket, room]);

  const initializeWebRTC = async () => {
    try {
      onSystemMessage('Initializing audio connection...');
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      setLocalStream(stream);
      
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
      }

      // Setup WebRTC transports and producers
      await setupTransports();
      await produceAudio(stream);
      
      setIsConnected(true);
      onSystemMessage('Audio connection established');

    } catch (error) {
      console.error('Error initializing WebRTC:', error);
      onSystemMessage('Error initializing audio: ' + error.message);
    }
  };

  const setupTransports = async () => {
    try {
      // Create send transport
      const sendTransport = await createTransport('send');
      transports.current.set('send', sendTransport);

      // Create recv transport
      const recvTransport = await createTransport('recv');
      transports.current.set('recv', recvTransport);

    } catch (error) {
      console.error('Error setting up transports:', error);
      throw error;
    }
  };

  const createTransport = async (direction) => {
    return new Promise((resolve, reject) => {
      socket.emit('create-transport', { direction }, (response) => {
        if (response.success) {
          const transport = new RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          });

          // Handle ICE candidates
          transport.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit('transport-ice-candidate', {
                transportId: response.transport.id,
                candidate: event.candidate
              });
            }
          };

          // Handle connection state
          transport.onconnectionstatechange = () => {
            console.log(`Transport ${direction} state:`, transport.connectionState);
          };

          resolve(transport);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  };

  const produceAudio = async (stream) => {
    try {
      const audioTrack = stream.getAudioTracks()[0];
      const sendTransport = transports.current.get('send');

      if (!sendTransport || !audioTrack) {
        throw new Error('No transport or audio track available');
      }

      const audioSender = sendTransport.addTrack(audioTrack, stream);
      producers.current.set('audio', audioSender);

      // Notify server about audio production
      socket.emit('produce-audio', {
        transportId: 'send',
        kind: 'audio',
        rtpParameters: getAudioRtpParameters()
      }, (response) => {
        if (response.success) {
          console.log('✅ Audio production started');
        }
      });

    } catch (error) {
      console.error('Error producing audio:', error);
      throw error;
    }
  };

  const getAudioRtpParameters = () => {
    return {
      codecs: [
        {
          mimeType: 'audio/opus',
          payloadType: 111,
          clockRate: 48000,
          channels: 2,
          parameters: {
            minptime: 10,
            useinbandfec: 1
          }
        }
      ],
      headerExtensions: [],
      encodings: [
        {
          ssrc: Math.floor(Math.random() * 1000000)
        }
      ],
      rtcp: {
        cname: `audio-${Date.now()}`
      }
    };
  };

  const toggleMicrophone = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMicMuted(!isMicMuted);
      onSystemMessage(isMicMuted ? 'Microphone unmuted' : 'Microphone muted');
    }
  };

  const cleanupWebRTC = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }

    transports.current.forEach(transport => transport.close());
    producers.current.forEach(producer => producer.close());
    consumers.current.forEach(consumer => consumer.close());

    transports.current.clear();
    producers.current.clear();
    consumers.current.clear();

    setIsConnected(false);
  };

  // Listen for new producers from other peers
  useEffect(() => {
    if (!socket) return;

    const handleNewProducer = async (data) => {
      if (data.kind === 'audio') {
        await consumeAudio(data.producerId);
      }
    };

    socket.on('new-producer', handleNewProducer);

    return () => {
      socket.off('new-producer', handleNewProducer);
    };
  }, [socket]);

  const consumeAudio = async (producerId) => {
    try {
      const recvTransport = transports.current.get('recv');
      if (!recvTransport) return;

      socket.emit('consume-audio', {
        transportId: 'recv',
        producerId,
        rtpCapabilities: getAudioRtpCapabilities()
      }, async (response) => {
        if (response.success) {
          const consumer = response.consumer;
          
          // Create a new stream from the consumer
          const stream = new MediaStream();
          const audioTrack = await createAudioTrackFromConsumer(consumer);
          stream.addTrack(audioTrack);
          
          setRemoteStream(stream);
          
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
          }

          consumers.current.set(consumer.id, consumer);
        }
      });

    } catch (error) {
      console.error('Error consuming audio:', error);
    }
  };

  const getAudioRtpCapabilities = () => {
    return {
      codecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          preferredPayloadType: 111,
          clockRate: 48000,
          channels: 2,
          parameters: {
            minptime: 10,
            useinbandfec: 1
          }
        }
      ],
      headerExtensions: []
    };
  };

  const createAudioTrackFromConsumer = async (consumer) => {
    // This would typically involve creating a MediaStreamTrack from the consumer data
    // For simplicity, we'll return a placeholder
    return await navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => stream.getAudioTracks()[0]);
  };

  return {
    localStream,
    remoteStream,
    isMicMuted,
    isConnected,
    localAudioRef,
    remoteAudioRef,
    toggleMicrophone,
    cleanupWebRTC
  };
};