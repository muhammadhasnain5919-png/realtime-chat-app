'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import api from '@/lib/api';
import { SocketProvider, useSocket } from '@/context/SocketContext';
import { User, Message } from '@/types';

function ChatInner() {
  const router = useRouter();
  const { socket, onlineUsers, isConnected } = useSocket();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.replace('/login');
      return;
    }
    const stored = localStorage.getItem('user');
    if (stored) setCurrentUser(JSON.parse(stored));

    (async () => {
      try {
        const { data } = await api.get('/users');
        setUsers(data.users || data || []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!socket) return;

    const onReceive = (msg: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
    };

    const onTyping = ({ userId, isTyping }: { userId: string; isTyping: boolean }) => {
      if (selectedUser && (selectedUser.id === userId || selectedUser._id === userId)) {
        setTyping(isTyping);
      }
    };

    socket.on('receiveMessage', onReceive);
    socket.on('userTyping', onTyping);

    return () => {
      socket.off('receiveMessage', onReceive);
      socket.off('userTyping', onTyping);
    };
  }, [socket, selectedUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const loadMessages = useCallback(async (user: User) => {
    try {
      const id = user.id || user._id;
      const { data } = await api.get(`/messages/${id}`);
      setMessages(data.messages || data || []);
      socket?.emit('markAsRead', { senderId: id });
    } catch {
      setMessages([]);
    }
  }, [socket]);

  const selectUser = (user: User) => {
    setSelectedUser(user);
    setTyping(false);
    loadMessages(user);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !selectedUser || !socket) return;
    const receiverId = selectedUser.id || selectedUser._id || '';
    socket.emit('sendMessage', { receiverId, content: text.trim() }, (res: any) => {
      if (res?.success && res.message) {
        setMessages((prev) => [...prev, res.message]);
      }
    });
    setText('');
    socket.emit('typing', { receiverId, isTyping: false });
  };

  const handleTyping = (value: string) => {
    setText(value);
    if (!selectedUser || !socket) return;
    const receiverId = selectedUser.id || selectedUser._id || '';
    socket.emit('typing', { receiverId, isTyping: true });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('typing', { receiverId, isTyping: false });
    }, 1000);
  };

  const logout = () => {
    Cookies.remove('token');
    localStorage.removeItem('user');
    socket?.disconnect();
    router.push('/login');
  };

  const filtered = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) &&
      (u.id || u._id) !== (currentUser?.id || currentUser?._id)
  );

  const isOnline = (u: User) => onlineUsers.includes(u.id || u._id || '');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-400">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-950">
      {/* Sidebar */}
      <div className="w-full sm:w-80 border-r border-gray-800 flex flex-col bg-gray-900">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <div className="font-semibold">{currentUser?.username}</div>
            <div className="text-xs text-gray-400 flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-500'}`} />
              {isConnected ? 'Connected' : 'Connecting...'}
            </div>
          </div>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-white">Logout</button>
        </div>
        <div className="p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((u) => {
            const id = u.id || u._id || '';
            const active = selectedUser && (selectedUser.id === id || selectedUser._id === id);
            return (
              <button
                key={id}
                onClick={() => selectUser(u)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800 transition ${
                  active ? 'bg-gray-800' : ''
                }`}
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-medium">
                    {u.username[0]?.toUpperCase()}
                  </div>
                  {isOnline(u) && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-gray-900 rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{u.username}</div>
                  <div className="text-xs text-gray-400">{isOnline(u) ? 'Online' : 'Offline'}</div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">No users found</div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col hidden sm:flex">
        {selectedUser ? (
          <>
            <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3 bg-gray-900">
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-medium">
                {selectedUser.username[0]?.toUpperCase()}
              </div>
              <div>
                <div className="font-semibold">{selectedUser.username}</div>
                <div className="text-xs text-gray-400">
                  {typing ? 'typing...' : isOnline(selectedUser) ? 'Online' : 'Offline'}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const senderId = typeof m.sender === 'object' ? (m.sender.id || m.sender._id) : m.sender;
                const mine = senderId === (currentUser?.id || currentUser?._id);
                return (
                  <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
                        mine
                          ? 'bg-indigo-600 rounded-br-md'
                          : 'bg-gray-800 rounded-bl-md'
                      }`}
                    >
                      <div>{m.content}</div>
                      <div className={`text-[10px] mt-1 ${mine ? 'text-indigo-200' : 'text-gray-500'}`}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {mine && (m.read ? ' ✓✓' : m.delivered ? ' ✓✓' : ' ✓')}
                      </div>
                    </div>
                  </div>
                );
              })}
              {typing && (
                <div className="text-xs text-gray-500 px-2">typing...</div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-4 border-t border-gray-800 flex gap-2 bg-gray-900">
              <input
                value={text}
                onChange={(e) => handleTyping(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!text.trim()}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl font-medium transition"
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a user to start chatting
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <SocketProvider>
      <ChatInner />
    </SocketProvider>
  );
}
