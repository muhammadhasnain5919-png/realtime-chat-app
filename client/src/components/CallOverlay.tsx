'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from '@/context/SocketContext';
import type { User, CallType } from '@/types';
import { uid } from '@/lib/api';

interface Props {
  currentUser: User;
  peer: User | null;
  callType: CallType;
  direction: 'outgoing' | 'incoming' | 'active' | null;
  onClose: () => void;
}

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

export default function CallOverlay({ currentUser, peer, callType, direction, onClose }: Props) {
  const { socket } = useSocket();
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(callType === 'audio');
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState(direction === 'outgoing' ? 'Calling...' : direction === 'incoming' ? 'Incoming call...' : 'Connected');

  const peerId = uid(peer);

  const cleanup = useCallback(() => {
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  }, []);

  const endCall = useCallback(() => {
    if (peerId && socket) socket.emit('call:end', { to: peerId });
    cleanup();
    onClose();
  }, [peerId, socket, cleanup, onClose]);

  const setupPC = useCallback(async (withVideo: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: withVideo,
    });
    localStream.current = stream;
    if (localVideo.current) {
      localVideo.current.srcObject = stream;
      localVideo.current.muted = true;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE });
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0];
      setStatus('Connected');
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && peerId && socket) {
        socket.emit('webrtc:ice', { to: peerId, candidate: e.candidate });
      }
    };

    return pc;
  }, [peerId, socket]);

  useEffect(() => {
    if (!socket || !peerId || !direction) return;

    const onAccepted = async () => {
      setStatus('Connecting...');
      const pc = await setupPC(callType === 'video');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc:offer', { to: peerId, offer });
    };

    const onOffer = async ({ from, offer }: any) => {
      if (from !== peerId) return;
      const pc = await setupPC(callType === 'video');
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc:answer', { to: peerId, answer });
      setStatus('Connected');
    };

    const onAnswer = async ({ from, answer }: any) => {
      if (from !== peerId) return;
      await pcRef.current?.setRemoteDescription(answer);
      setStatus('Connected');
    };

    const onIce = async ({ from, candidate }: any) => {
      if (from !== peerId || !candidate) return;
      try {
        await pcRef.current?.addIceCandidate(candidate);
      } catch {}
    };

    const onEnded = () => {
      cleanup();
      onClose();
    };

    const onRejected = () => {
      cleanup();
      onClose();
    };

    socket.on('call:accepted', onAccepted);
    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:ice', onIce);
    socket.on('call:ended', onEnded);
    socket.on('call:rejected', onRejected);

    if (direction === 'outgoing') {
      socket.emit('call:invite', { to: peerId, callType });
    }

    return () => {
      socket.off('call:accepted', onAccepted);
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:ice', onIce);
      socket.off('call:ended', onEnded);
      socket.off('call:rejected', onRejected);
    };
  }, [socket, peerId, direction, callType, setupPC, cleanup, onClose]);

  const accept = () => {
    if (peerId && socket) {
      socket.emit('call:accept', { to: peerId });
      setStatus('Connecting...');
    }
  };

  const reject = () => {
    if (peerId && socket) socket.emit('call:reject', { to: peerId });
    cleanup();
    onClose();
  };

  const toggleMute = () => {
    localStream.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setMuted((m) => !m);
  };

  const toggleCam = () => {
    localStream.current?.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setCamOff((c) => !c);
  };

  const toggleShare = async () => {
    if (!pcRef.current) return;
    if (sharing) {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const vTrack = cam.getVideoTracks()[0];
      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
      if (sender && vTrack) await sender.replaceTrack(vTrack);
      localStream.current?.getVideoTracks().forEach((t) => t.stop());
      localStream.current = cam;
      if (localVideo.current) localVideo.current.srcObject = cam;
      setSharing(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const sTrack = screen.getVideoTracks()[0];
        const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
        if (sender && sTrack) await sender.replaceTrack(sTrack);
        if (localVideo.current) localVideo.current.srcObject = screen;
        sTrack.onended = () => toggleShare();
        setSharing(true);
      } catch {}
    }
  };

  if (!direction || !peer) return null;

  const name = peer.displayName || peer.username;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1e1f22]">
      <div className="flex-1 relative flex items-center justify-center">
        <video ref={remoteVideo} autoPlay playsInline className="max-h-full max-w-full rounded-lg bg-black" />
        {!remoteVideo.current?.srcObject && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-24 h-24 rounded-full bg-[#5865f2] flex items-center justify-center text-3xl font-bold">
              {name[0]?.toUpperCase()}
            </div>
            <div className="text-xl font-semibold">{name}</div>
            <div className="text-[#949ba4]">{status}</div>
          </div>
        )}
        <video
          ref={localVideo}
          autoPlay
          playsInline
          muted
          className="absolute bottom-4 right-4 w-40 h-28 object-cover rounded-lg bg-black border border-[#1e1f22] shadow-lg"
        />
      </div>

      <div className="flex items-center justify-center gap-4 py-6 bg-[#2b2d31]">
        {direction === 'incoming' && status.includes('Incoming') ? (
          <>
            <button onClick={accept} className="w-14 h-14 rounded-full bg-[#23a559] flex items-center justify-center text-white text-xl" title="Accept">
              ☎
            </button>
            <button onClick={reject} className="w-14 h-14 rounded-full bg-[#f23f43] flex items-center justify-center text-white text-xl" title="Decline">
              ✕
            </button>
          </>
        ) : (
          <>
            <button onClick={toggleMute} className={`w-12 h-12 rounded-full flex items-center justify-center ${muted ? 'bg-[#f23f43]' : 'bg-[#4e5058]'}`} title="Mute">
              {muted ? '🔇' : '🎤'}
            </button>
            {callType === 'video' && (
              <button onClick={toggleCam} className={`w-12 h-12 rounded-full flex items-center justify-center ${camOff ? 'bg-[#f23f43]' : 'bg-[#4e5058]'}`} title="Camera">
                {camOff ? '📷' : '📹'}
              </button>
            )}
            <button onClick={toggleShare} className={`w-12 h-12 rounded-full flex items-center justify-center ${sharing ? 'bg-[#5865f2]' : 'bg-[#4e5058]'}`} title="Share screen">
              🖥️
            </button>
            <button onClick={endCall} className="w-14 h-14 rounded-full bg-[#f23f43] flex items-center justify-center text-white text-xl" title="End call">
              ☎
            </button>
          </>
        )}
      </div>
    </div>
  );
}
