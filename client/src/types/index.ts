export interface User {
  id?: string;
  _id?: string;
  username: string;
  displayName?: string;
  email?: string;
  emailVerified?: boolean;
  phone?: string;
  bio?: string;
  avatar?: string;
  isOnline?: boolean;
  status?: 'online' | 'idle' | 'dnd' | 'offline';
  customStatus?: string;
  lastSeen?: string;
  createdAt?: string;
}

export interface Message {
  _id: string;
  sender: User | string;
  receiver: User | string;
  content: string;
  delivered: boolean;
  read: boolean;
  createdAt: string;
  type?: 'text' | 'image';
}

export interface FriendRelation {
  relationId: string;
  user: User;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export type CallType = 'audio' | 'video';
