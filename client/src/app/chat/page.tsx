'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import api, { uid } from '@/lib/api';
import { SocketProvider, useSocket } from '@/context/SocketContext';
import { User, Message, FriendRelation, CallType } from '@/types';
import CallOverlay from '@/components/CallOverlay';

function ChatApp() {
  const router = useRouter();
  const { socket, onlineUsers, isConnected } = useSocket();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [friends, setFriends] = useState<FriendRelation[]>([]);
  const [incoming, setIncoming] = useState<FriendRelation[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRelation[]>([]);
  const [tab, setTab] = useState<'online' | 'all' | 'pending' | 'add'>('online');
  const [selected, setSelected] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [addUser, setAddUser] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ displayName: '', phone: '', bio: '', customStatus: '' });
  const [call, setCall] = useState<{ peer: User; type: CallType; direction: 'outgoing' | 'incoming' | 'active' } | null>(null);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const typingTO = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFriends = useCallback(async () => {
    try {
      const { data } = await api.get('/friends');
      setFriends(data.friends || []);
      setIncoming(data.incoming || []);
      setOutgoing(data.outgoing || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (!Cookies.get('token')) {
      router.replace('/login');
      return;
    }
    const stored = localStorage.getItem('user');
    if (stored) {
      const u = JSON.parse(stored);
      setCurrentUser(u);
      setProfileForm({
        displayName: u.displayName || u.username || '',
        phone: u.phone || '',
        bio: u.bio || '',
        customStatus: u.customStatus || '',
      });
    }
    (async () => {
      try {
        const { data } = await api.get('/profile/me');
        if (data.user) {
          setCurrentUser(data.user);
          localStorage.setItem('user', JSON.stringify(data.user));
          setProfileForm({
            displayName: data.user.displayName || data.user.username || '',
            phone: data.user.phone || '',
            bio: data.user.bio || '',
            customStatus: data.user.customStatus || '',
          });
        }
      } catch {}
      await loadFriends();
      setLoading(false);
    })();
  }, [router, loadFriends]);

  useEffect(() => {
    if (!socket) return;
    const onMsg = (msg: Message) => {
      setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]));
    };
    const onTyping = ({ userId, isTyping }: { userId: string; isTyping: boolean }) => {
      if (selected && uid(selected) === userId) setTyping(isTyping);
    };
    const onIncomingCall = ({ fromUser, callType }: any) => {
      setCall({ peer: fromUser, type: callType || 'video', direction: 'incoming' });
    };
    socket.on('receiveMessage', onMsg);
    socket.on('userTyping', onTyping);
    socket.on('call:incoming', onIncomingCall);
    return () => {
      socket.off('receiveMessage', onMsg);
      socket.off('userTyping', onTyping);
      socket.off('call:incoming', onIncomingCall);
    };
  }, [socket, selected]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const openDM = async (user: User) => {
    setSelected(user);
    setTyping(false);
    try {
      const { data } = await api.get(`/messages/${uid(user)}`);
      setMessages(data.messages || []);
      socket?.emit('markAsRead', { senderId: uid(user) });
    } catch {
      setMessages([]);
    }
  };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !selected || !socket) return;
    const receiverId = uid(selected);
    socket.emit('sendMessage', { receiverId, content: text.trim() }, (res: any) => {
      if (res?.success && res.message) setMessages((p) => [...p, res.message]);
    });
    setText('');
    socket.emit('typing', { receiverId, isTyping: false });
  };

  const onType = (v: string) => {
    setText(v);
    if (!selected || !socket) return;
    const receiverId = uid(selected);
    socket.emit('typing', { receiverId, isTyping: true });
    if (typingTO.current) clearTimeout(typingTO.current);
    typingTO.current = setTimeout(() => socket.emit('typing', { receiverId, isTyping: false }), 1000);
  };

  const sendRequest = async () => {
    setAddMsg('');
    try {
      await api.post('/friends/request', { username: addUser.trim() });
      setAddMsg('Friend request sent!');
      setAddUser('');
      loadFriends();
    } catch (err: any) {
      setAddMsg(err.response?.data?.message || 'Failed to send request');
    }
  };

  const acceptReq = async (id: string) => {
    await api.post(`/friends/accept/${id}`);
    loadFriends();
  };

  const rejectReq = async (id: string) => {
    await api.post(`/friends/reject/${id}`);
    loadFriends();
  };

  const saveProfile = async () => {
    try {
      const { data } = await api.put('/profile/me', profileForm);
      setCurrentUser(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
      setShowProfile(false);
    } catch {}
  };

  const verifyEmail = async () => {
    try {
      const { data } = await api.post('/profile/verify-email');
      setCurrentUser(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
    } catch {}
  };

  const startCall = (type: CallType) => {
    if (!selected) return;
    setCall({ peer: selected, type, direction: 'outgoing' });
  };

  const logout = () => {
    Cookies.remove('token');
    localStorage.removeItem('user');
    socket?.disconnect();
    router.push('/login');
  };

  const isOn = (u: User) => onlineUsers.includes(uid(u)) || u.isOnline;
  const onlineFriends = friends.filter((f) => isOn(f.user));
  const list =
    tab === 'online' ? onlineFriends : tab === 'all' ? friends : tab === 'pending' ? [] : [];

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#1e1f22] text-[#949ba4]">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-[#1e1f22] text-[#dbdee1] overflow-hidden">
      {/* Left rail */}
      <div className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 gap-2 border-r border-[#1a1b1e]">
        <button
          onClick={() => { setSelected(null); setTab('online'); }}
          className="w-12 h-12 rounded-[16px] bg-[#5865f2] flex items-center justify-center text-xl font-bold hover:rounded-[30%] transition-all"
          title="Home"
        >
          ⌂
        </button>
        <div className="w-8 h-[2px] bg-[#35373c] rounded" />
        <div className="flex-1" />
        <button onClick={() => setShowProfile(true)} className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center text-sm font-bold" title="Profile">
          {(currentUser?.displayName || currentUser?.username || '?')[0]?.toUpperCase()}
        </button>
      </div>

      {/* Friends / DM sidebar */}
      <div className="w-[240px] bg-[#2b2d31] flex flex-col">
        <div className="h-12 px-4 flex items-center shadow-md font-semibold text-sm border-b border-[#1e1f22]">
          Direct Messages
        </div>
        <div className="p-2">
          <input
            placeholder="Find or start a conversation"
            className="discord-input text-sm py-1.5"
            onChange={() => {}}
          />
        </div>
        <button
          onClick={() => { setSelected(null); setTab('online'); }}
          className={`mx-2 px-2 py-1.5 rounded text-sm text-left flex items-center gap-2 ${!selected ? 'bg-[#35373c] text-white' : 'text-[#949ba4] hover:bg-[#35373c]/hover:text-[#dbdee1]'}`}
        >
          <span>👥</span> Friends
          {incoming.length > 0 && (
            <span className="ml-auto bg-[#f23f43] text-white text-[10px] px-1.5 rounded-full">{incoming.length}</span>
          )}
        </button>
        <div className="px-2 mt-2 text-[11px] font-semibold text-[#949ba4] uppercase tracking-wide">Direct Messages</div>
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {friends.map((f) => {
            const u = f.user;
            const active = selected && uid(selected) === uid(u);
            return (
              <button
                key={uid(u)}
                onClick={() => openDM(u)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left ${
                  active ? 'bg-[#35373c] text-white' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
                }`}
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white">
                    {(u.displayName || u.username)[0]?.toUpperCase()}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 status-dot status-${isOn(u) ? 'online' : 'offline'}`} />
                </div>
                <span className="truncate">{u.displayName || u.username}</span>
              </button>
            );
          })}
        </div>
        {/* User panel */}
        <div className="h-[52px] bg-[#232428] px-2 flex items-center gap-2">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-bold">
              {(currentUser?.displayName || currentUser?.username || '?')[0]?.toUpperCase()}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 status-dot status-${isConnected ? 'online' : 'offline'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{currentUser?.displayName || currentUser?.username}</div>
            <div className="text-[11px] text-[#949ba4] truncate">{currentUser?.customStatus || (isConnected ? 'Online' : 'Offline')}</div>
          </div>
          <button onClick={() => setShowProfile(true)} className="p-1.5 rounded hover:bg-[#35373c] text-[#b5bac1]" title="Settings">⚙</button>
          <button onClick={logout} className="p-1.5 rounded hover:bg-[#35373c] text-[#b5bac1]" title="Logout">⎋</button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col bg-[#313338] min-w-0">
        {selected ? (
          <>
            <div className="h-12 px-4 flex items-center gap-3 shadow-md border-b border-[#1e1f22]">
              <span className="text-[#949ba4]">@</span>
              <span className="font-semibold">{selected.displayName || selected.username}</span>
              {selected.emailVerified && <span className="text-[10px] bg-[#23a559]/20 text-[#23a559] px-1.5 rounded">Verified</span>}
              <div className="flex-1" />
              <button onClick={() => startCall('audio')} className="p-2 rounded hover:bg-[#35373c]" title="Voice call">📞</button>
              <button onClick={() => startCall('video')} className="p-2 rounded hover:bg-[#35373c]" title="Video call">📹</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((m) => {
                const sid = typeof m.sender === 'object' ? uid(m.sender) : m.sender;
                const mine = sid === uid(currentUser);
                const senderName =
                  typeof m.sender === 'object'
                    ? m.sender.displayName || m.sender.username
                    : mine
                    ? currentUser?.displayName || currentUser?.username
                    : selected.displayName || selected.username;
                return (
                  <div key={m._id} className="flex gap-3 hover:bg-[#2e3035]/50 px-2 py-1 rounded group">
                    <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center text-sm font-bold shrink-0">
                      {(senderName || '?')[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-sm">{senderName}</span>
                        <span className="text-[11px] text-[#949ba4]">
                          {new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-[#dbdee1] text-[15px] leading-relaxed break-words">{m.content}</div>
                      {mine && (
                        <div className="text-[10px] text-[#949ba4]">
                          {m.read ? 'Read' : m.delivered ? 'Delivered' : 'Sent'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {typing && <div className="text-xs text-[#949ba4] px-2">{selected.displayName || selected.username} is typing...</div>}
              <div ref={endRef} />
            </div>
            <div className="px-4 pb-6">
              <form onSubmit={send} className="bg-[#383a40] rounded-lg flex items-center px-4">
                <input
                  value={text}
                  onChange={(e) => onType(e.target.value)}
                  placeholder={`Message @${selected.displayName || selected.username}`}
                  className="flex-1 bg-transparent py-3 text-[15px] outline-none placeholder:text-[#6d6f78]"
                />
                <button type="submit" disabled={!text.trim()} className="text-[#5865f2] disabled:opacity-30 font-medium text-sm">
                  Send
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <div className="h-12 px-4 flex items-center gap-4 shadow-md border-b border-[#1e1f22]">
              <span className="font-semibold">Friends</span>
              <div className="w-px h-6 bg-[#3f4147]" />
              {(['online', 'all', 'pending', 'add'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-2 py-0.5 rounded text-sm capitalize ${
                    tab === t ? 'bg-[#35373c] text-white' : 'text-[#949ba4] hover:text-[#dbdee1]'
                  }`}
                >
                  {t === 'add' ? 'Add Friend' : t}
                  {t === 'pending' && incoming.length > 0 && (
                    <span className="ml-1 bg-[#f23f43] text-white text-[10px] px-1.5 rounded-full">{incoming.length}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {tab === 'add' && (
                <div className="max-w-xl">
                  <h2 className="text-xl font-bold mb-1">Add Friend</h2>
                  <p className="text-[#949ba4] text-sm mb-4">You can add friends with their username.</p>
                  <div className="flex gap-2 bg-[#1e1f22] rounded-lg p-2">
                    <input
                      value={addUser}
                      onChange={(e) => setAddUser(e.target.value)}
                      placeholder="Enter a username"
                      className="flex-1 bg-transparent outline-none px-2"
                    />
                    <button onClick={sendRequest} className="discord-btn text-sm whitespace-nowrap">
                      Send Friend Request
                    </button>
                  </div>
                  {addMsg && <p className="mt-2 text-sm text-[#949ba4]">{addMsg}</p>}
                </div>
              )}
              {tab === 'pending' && (
                <div className="space-y-2 max-w-2xl">
                  <div className="text-xs font-semibold text-[#949ba4] uppercase mb-2">Incoming — {incoming.length}</div>
                  {incoming.map((r) => (
                    <div key={r.relationId} className="flex items-center gap-3 p-3 rounded-lg bg-[#2b2d31] border border-[#1e1f22]">
                      <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center font-bold">
                        {(r.user.displayName || r.user.username)[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{r.user.displayName || r.user.username}</div>
                        <div className="text-xs text-[#949ba4]">Incoming Friend Request</div>
                      </div>
                      <button onClick={() => acceptReq(r.relationId)} className="discord-btn text-sm">Accept</button>
                      <button onClick={() => rejectReq(r.relationId)} className="discord-btn-secondary text-sm">Ignore</button>
                    </div>
                  ))}
                  <div className="text-xs font-semibold text-[#949ba4] uppercase mt-6 mb-2">Outgoing — {outgoing.length}</div>
                  {outgoing.map((r) => (
                    <div key={r.relationId} className="flex items-center gap-3 p-3 rounded-lg bg-[#2b2d31] border border-[#1e1f22]">
                      <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center font-bold">
                        {(r.user.displayName || r.user.username)[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{r.user.displayName || r.user.username}</div>
                        <div className="text-xs text-[#949ba4]">Outgoing Friend Request</div>
                      </div>
                      <button onClick={() => rejectReq(r.relationId)} className="discord-btn-secondary text-sm">Cancel</button>
                    </div>
                  ))}
                  {incoming.length === 0 && outgoing.length === 0 && (
                    <p className="text-[#949ba4] text-sm">No pending requests.</p>
                  )}
                </div>
              )}
              {(tab === 'online' || tab === 'all') && (
                <div className="max-w-2xl">
                  <div className="text-xs font-semibold text-[#949ba4] uppercase mb-2">
                    {tab === 'online' ? `Online — ${list.length}` : `All friends — ${list.length}`}
                  </div>
                  {list.map((f) => (
                    <button
                      key={uid(f.user)}
                      onClick={() => openDM(f.user)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[#2b2d31] text-left"
                    >
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center font-bold">
                          {(f.user.displayName || f.user.username)[0]?.toUpperCase()}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 status-dot status-${isOn(f.user) ? 'online' : 'offline'}`} />
                      </div>
                      <div>
                        <div className="font-medium">{f.user.displayName || f.user.username}</div>
                        <div className="text-xs text-[#949ba4]">{isOn(f.user) ? 'Online' : 'Offline'}</div>
                      </div>
                    </button>
                  ))}
                  {list.length === 0 && (
                    <p className="text-[#949ba4] text-sm">
                      {tab === 'online' ? 'No one is online right now.' : 'No friends yet. Add some!'}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Profile modal */}
      {showProfile && currentUser && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70" onClick={() => setShowProfile(false)}>
          <div className="bg-[#313338] rounded-xl w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="h-20 bg-[#5865f2]" />
            <div className="px-4 -mt-8">
              <div className="w-20 h-20 rounded-full bg-[#5865f2] border-4 border-[#313338] flex items-center justify-center text-2xl font-bold">
                {(currentUser.displayName || currentUser.username)[0]?.toUpperCase()}
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#b5bac1] uppercase">Display Name</label>
                <input className="discord-input mt-1" value={profileForm.displayName} onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#b5bac1] uppercase">Username</label>
                <input className="discord-input mt-1 opacity-60" value={currentUser.username} disabled />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#b5bac1] uppercase">Email</label>
                <div className="flex gap-2 mt-1">
                  <input className="discord-input opacity-60" value={currentUser.email || ''} disabled />
                  {currentUser.emailVerified ? (
                    <span className="text-[#23a559] text-sm self-center whitespace-nowrap">Verified ✓</span>
                  ) : (
                    <button onClick={verifyEmail} className="discord-btn text-sm whitespace-nowrap">Verify</button>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#b5bac1] uppercase">Phone Number</label>
                <input className="discord-input mt-1" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="+1 234 567 8900" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#b5bac1] uppercase">Custom Status</label>
                <input className="discord-input mt-1" value={profileForm.customStatus} onChange={(e) => setProfileForm({ ...profileForm, customStatus: e.target.value })} placeholder="What are you up to?" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#b5bac1] uppercase">About Me</label>
                <textarea className="discord-input mt-1 min-h-[80px] resize-none" value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} maxLength={190} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowProfile(false)} className="discord-btn-secondary text-sm">Cancel</button>
                <button onClick={saveProfile} className="discord-btn text-sm">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {call && currentUser && (
        <CallOverlay
          currentUser={currentUser}
          peer={call.peer}
          callType={call.type}
          direction={call.direction}
          onClose={() => setCall(null)}
        />
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <SocketProvider>
      <ChatApp />
    </SocketProvider>
  );
}
