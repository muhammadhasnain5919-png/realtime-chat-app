# Real-Time Chat Application

A full-stack real-time one-to-one messaging application built with **Node.js**, **Express.js**, **Socket.IO**, **Next.js (React)**, and **MongoDB**.

## Features

- **User Authentication** – Register & Login with JWT (stored in cookies)
- **User Listing & Search** – Browse and search other users
- **Real-time Messaging** – Instant one-to-one chat via Socket.IO
- **Online / Offline Status** – Live presence indicators
- **Typing Indicators** – See when the other person is typing
- **Message History** – Conversations persisted in MongoDB
- **Delivery & Read Receipts** – ✓ sent, ✓✓ delivered, ✓✓ read
- **Responsive UI** – Works on desktop and mobile

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | Next.js 14, React, TypeScript, Tailwind CSS |
| Backend    | Node.js, Express.js                 |
| Real-time  | Socket.IO                           |
| Database   | MongoDB (Mongoose)                  |
| Auth       | JWT + bcryptjs                      |

## Project Structure

```
chat-app/
├── server/                 # Backend
│   ├── src/
│   │   ├── models/         # User, Message
│   │   ├── routes/         # auth, users, messages
│   │   ├── middleware/     # JWT auth
│   │   └── index.js        # Express + Socket.IO server
│   ├── .env.example
│   └── package.json
├── client/                 # Frontend (Next.js)
│   ├── src/
│   │   ├── app/            # Pages (login, register, chat)
│   │   ├── components/     # UserList, ChatWindow
│   │   ├── context/        # AuthContext, SocketContext
│   │   ├── lib/            # API client
│   │   └── types/
│   ├── .env.example
│   └── package.json
└── README.md
```

## Prerequisites

- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- npm or yarn

## MongoDB Atlas Setup (Recommended)

1. Go to [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) and sign up / log in.
2. Create a **free M0 cluster** (choose a cloud provider & region close to you).
3. Create a **Database User**:
   - Database Access → Add New Database User
   - Choose Password authentication
   - Username + strong password (save them!)
4. Network Access → Add IP Address:
   - For development: `0.0.0.0/0` (allow from anywhere) **or** your current IP
5. Click **Connect** on your cluster → **Drivers** → copy the connection string.
   - It looks like:  
     `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
6. Replace `<password>` with your actual password and add a database name:
   ```
   mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/chat-app?retryWrites=true&w=majority
   ```

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/muhammadhasnain5919-png/realtime-chat-app.git
cd realtime-chat-app
```

### 2. Backend setup

```bash
cd server
cp .env.example .env
# Edit .env and fill in:
#   MONGO_URI=your_atlas_connection_string
#   JWT_SECRET=any_long_random_string
#   CLIENT_URL=http://localhost:3000
npm install
npm run dev
```

Server runs on **http://localhost:5000**

### 3. Frontend setup

```bash
cd ../client
cp .env.example .env.local
# (defaults point to localhost:5000 – change if needed)
npm install
npm run dev
```

Client runs on **http://localhost:3000**

### 4. Open the app

Visit **http://localhost:3000**

1. Register two different users (use two browsers or one normal + one incognito)
2. Log in with both
3. Select the other user and start chatting!

## Socket.IO Events

| Event              | Direction     | Description                          |
|--------------------|---------------|--------------------------------------|
| `sendMessage`      | Client → Server | Send a private message             |
| `receiveMessage`   | Server → Client | New message received               |
| `typing`           | Client → Server | Start/stop typing                  |
| `userTyping`       | Server → Client | Other user is typing               |
| `markAsRead`       | Client → Server | Mark conversation as read          |
| `messagesRead`     | Server → Client | Messages were read by peer         |
| `messageDelivered` | Server → Client | Message delivered to peer          |
| `userOnline` / `userOffline` | Server → All | Presence updates              |
| `onlineUsers`      | Server → Client | List of currently online user IDs  |

## Environment Variables

### Server (`.env`)

```
PORT=5000
MONGO_URI=mongodb+srv://...
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000
```

### Client (`.env.local`)

```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

## Production Notes

- Change `JWT_SECRET` to a strong random value
- Restrict MongoDB Atlas Network Access to your server IPs
- Set `CLIENT_URL` to your deployed frontend URL
- Consider using Redis adapter for Socket.IO if scaling horizontally
- Deploy backend (Render, Railway, Fly.io, etc.) and frontend (Vercel)

## License

MIT
