export interface User {
  id: string;
  _id?: string;
  username: string;
  email: string;
  avatar?: string;
  isOnline?: boolean;
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

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}
