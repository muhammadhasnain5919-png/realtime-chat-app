'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Cookies from 'js-cookie';
import api from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', { username, email, password });
      Cookies.set('token', data.token, { expires: 7 });
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push('/chat');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#5865f2] px-4">
      <div className="w-full max-w-md bg-[#313338] rounded-md p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-center text-white mb-6">Create an account</h1>
        {error && <div className="mb-4 p-3 bg-[#f23f43]/15 text-[#f23f43] rounded text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="discord-input" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} className="discord-input" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="discord-input" />
          </div>
          <button type="submit" disabled={loading} className="discord-btn w-full py-2.5 mt-2">
            {loading ? 'Creating...' : 'Continue'}
          </button>
        </form>
        <p className="mt-4 text-sm text-[#949ba4]">
          Already have an account? <Link href="/login" className="text-[#00a8fc] hover:underline">Log In</Link>
        </p>
      </div>
    </div>
  );
}
