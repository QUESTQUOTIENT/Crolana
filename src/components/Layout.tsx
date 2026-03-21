import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Notifications } from './Notifications';
import { AIAssistant } from './AIAssistant';

export function Layout() {
  return (
    <div className="min-h-screen text-slate-200 font-sans" style={{ background: 'var(--bg-base, #020817)' }}>
      <Sidebar />
      {/* Main area shifts right by sidebar width via CSS var set in Sidebar */}
      <Header />
      <main
        className="transition-all duration-300 pt-16 min-h-screen"
        style={{ paddingLeft: 'var(--sidebar-width, 16rem)' }}
      >
        <div className="max-w-7xl mx-auto p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
      <Notifications />
      {/* AI Assistant — floating bubble, bottom-left, zero impact on rest of app */}
      <AIAssistant />
    </div>
  );
}
