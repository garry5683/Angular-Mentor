
import React, { useState } from 'react';
import { 
  loginWithGoogle, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  auth,
  logout
} from '../services/firebase';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [userEmailToVerify, setUserEmailToVerify] = useState('');

  const clearInputs = () => {
    setName('');
    setEmail('');
    setPassword('');
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (userCredential.user) {
          // Update profile with name
          await updateProfile(userCredential.user, { displayName: name });
          // Send verification
          await sendEmailVerification(userCredential.user);
          setUserEmailToVerify(email);
          setNeedsVerification(true);
          // Sign out immediately to prevent access until verified
          await logout();
          clearInputs();
        }
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (userCredential.user) {
          if (!userCredential.user.emailVerified) {
            setUserEmailToVerify(email);
            setNeedsVerification(true);
            await logout(); // Block access
            clearInputs();
          } else {
            clearInputs();
            onLoginSuccess();
          }
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err.code, err.message);
      if (isSignUp && err.code === 'auth/email-already-in-use') {
        setError("User already exists. Please sign in");
      } else if (!isSignUp && (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password')) {
        setError("Email or password is incorrect");
      } else {
        setError(err.message || "An error occurred during authentication");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      const result = await loginWithGoogle();
      if (result.user) {
        clearInputs();
        onLoginSuccess();
      }
    } catch (err: any) {
      console.error("Google Login failed:", err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError("Sign-in cancelled. Please try again.");
      } else if (err.code === 'auth/cancelled-popup-request') {
        setError("Only one login popup can be open at a time.");
      } else {
        setError(err.message || "Failed to sign in with Google.");
      }
    }
  };

  if (needsVerification) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 relative overflow-hidden text-center">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-fuchsia-600/10 rounded-full blur-[120px]"></div>
        
        <div className="max-w-md w-full space-y-8 relative z-10">
          <div className="w-20 h-20 bg-indigo-600/20 border border-indigo-500/30 rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl">
            <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          
          <div className="space-y-4">
            <h1 className="text-3xl font-black tracking-tighter text-white">Check your email</h1>
            <p className="text-slate-400 font-medium text-lg leading-relaxed">
              We have sent you a verification email to <span className="text-indigo-400 font-bold">{userEmailToVerify}</span>. 
              Please verify it and log in.
            </p>
          </div>

          <button 
            onClick={() => {
              setNeedsVerification(false);
              setIsSignUp(false); // Redirect to login/signin page
              setError(null);
              clearInputs();
            }}
            className="w-full py-4 bg-white text-slate-950 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all hover:bg-slate-100"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-fuchsia-600/10 rounded-full blur-[120px]"></div>

      <div className="max-w-md w-full space-y-8 relative z-10 text-center">
        <div className="space-y-4">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xl shadow-indigo-600/40">
            <span className="text-2xl font-black italic tracking-tighter text-white">AM</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter bg-gradient-to-br from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
            ANGULAR MENTOR
          </h1>
        </div>

        <form onSubmit={handleAuth} className="space-y-4 bg-slate-900/50 p-8 rounded-3xl border border-slate-800 backdrop-blur-sm">
          {isSignUp && (
            <div className="space-y-2 text-left animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">Full Name</label>
              <input 
                type="text" 
                required={isSignUp}
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none transition-all text-sm"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          
          <div className="space-y-2 text-left">
            <label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">Email Address</label>
            <input 
              type="email" 
              required
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none transition-all text-sm"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2 text-left">
            <label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">Password</label>
            <input 
              type="password" 
              required
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none transition-all text-sm"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>

          <div className="pt-2">
            <button 
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
              className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
          <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest"><span className="bg-[#020617] px-4 text-slate-600">Or continue with</span></div>
        </div>

        <button 
          type="button"
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-4 px-8 py-4 bg-white text-slate-950 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95 shadow-xl shadow-white/5 border border-slate-200"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
      </div>

      <style>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
