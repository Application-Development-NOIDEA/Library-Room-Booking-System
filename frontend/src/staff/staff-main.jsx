import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import StaffDashboard from './StaffDashboard';
import { authApi, tokenStore } from '../auth/authService';
import './StaffDashboard.css';

function Gate({ title, children }) {
  return (
    <div className="staff-app" style={{ display: 'block' }}>
      <div className="staff-gate">
        <div className="staff-gate-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="26" height="26">
            <path d="M16 9.5C13.2 7.6 9.6 7 5.5 7.4v15.4c4.1-.4 7.7.2 10.5 2.1 2.8-1.9 6.4-2.5 10.5-2.1V7.4C22.4 7 18.8 7.6 16 9.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M16 9.5v15.4" stroke="currentColor" strokeWidth="1.8" />
            <path d="M20 8.4v6.4l1.8-1.3 1.8 1.3V8" fill="currentColor" />
          </svg>
        </div>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

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
      .then(({ user }) => setState(user.role === 'staff' ? { status: 'ok', token, user } : { status: 'denied' }))
      .catch(() => {
        tokenStore.clear();
        setState({ status: 'signin' });
      });
  }, []);

  if (state.status === 'checking') return <Gate title="Checking your session…"><p>One moment please.</p></Gate>;
  if (state.status === 'signin') {
    return (
      <Gate title="Staff sign-in required">
        <p>Please sign in with a library staff account.</p>
        <a href="/">Go to sign in</a>
      </Gate>
    );
  }
  if (state.status === 'denied') {
    return (
      <Gate title="Staff access only">
        <p>This account doesn't have access to the staff workspace.</p>
        <a href="/">Back to the student site</a>
      </Gate>
    );
  }
  return <StaffDashboard token={state.token} user={state.user} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StaffGate />
  </React.StrictMode>
);