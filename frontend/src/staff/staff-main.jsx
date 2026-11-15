import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import StaffDashboard from './StaffDashboard';
import { authApi, tokenStore } from '../auth/authService';

const box = { maxWidth: 420, margin: '15vh auto', padding: 24, fontFamily: 'system-ui, sans-serif', textAlign: 'center' };

function StaffGate() {
  const [state, setState] = useState({ status: 'checking' });

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      setState({ status: 'signin' });
      return;
    }
    authApi
      .me(token)
      .then(({ user }) => setState(user.role === 'staff' ? { status: 'ok', token } : { status: 'denied' }))
      .catch(() => {
        tokenStore.clear();
        setState({ status: 'signin' });
      });
  }, []);

  if (state.status === 'checking') return <div style={box}>Checking your session…</div>;
  if (state.status === 'signin') {
    return (
      <div style={box}>
        <h2>Staff sign-in required</h2>
        <p>Please sign in with a library staff account.</p>
        <a href="/">Go to sign in</a>
      </div>
    );
  }
  if (state.status === 'denied') {
    return (
      <div style={box}>
        <h2>Staff access only</h2>
        <p>This account doesn't have access to the staff workspace.</p>
        <a href="/">Back to the student site</a>
      </div>
    );
  }
  return <StaffDashboard token={state.token} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StaffGate />
  </React.StrictMode>
);