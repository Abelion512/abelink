import React, { useEffect, useState } from 'react';
import { useChat } from '../contexts/ChatContext';
import OrbVisualizer from '../components/core/OrbVisualizer';
import InputBar from '../components/core/InputBar';
import ResponseArea from '../components/core/ResponseArea';
import StatusIndicator from '../components/core/StatusIndicator';
import FloatingMenu from '../components/core/FloatingMenu';
import HistoryDrawer from '../components/core/HistoryDrawer';
import ProcessPanel from '../components/core/ProcessPanel';
import NowPlayingWidget from '../components/core/NowPlayingWidget';

const MarkHome = () => {
  const {
    chatData,
    message,
    setMessage,
    isLoading,
    isSpeak,
    setIsSpeak,
    handlePlanningCommand,
    orbStatus,
    setOrbStatus,
    notifications,
    activeProcesses,
    dismissProcess,
    inputSource,
    handleStop
  } = useChat();

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [currentResponse, setCurrentResponse] = useState(null);

  // Sync orb status based on isLoading
  useEffect(() => {
    if (isLoading) {
      // If last message is thinking, then thinking. Else speaking/executing
      const lastMsg = chatData[chatData.length - 1];
      if (lastMsg?.isThinking) {
        setOrbStatus('thinking');
      } else if (lastMsg?.isSearching) {
        setOrbStatus('thinking');
      } else if (lastMsg?.role === 'ai' && lastMsg?.content?.includes('Mengeksekusi plugin')) {
        setOrbStatus('thinking');
      } else {
        setOrbStatus('listening');
      }
    } else {
      setOrbStatus('idle');
    }
  }, [isLoading, chatData, setOrbStatus]);

  // Derived currentResponse from chatData
  useEffect(() => {
    if (chatData && chatData.length > 0) {
      const lastItem = chatData[chatData.length - 1];
      
      if (lastItem.role === 'ai') {
        if (lastItem.isThinking || lastItem.isSearching) {
          // It's a loading state, we might show a short text
          setCurrentResponse({
            text: lastItem.content || 'Berpikir...',
            type: 'short'
          });
        } else {
          // Final response
          setCurrentResponse({
            text: lastItem.content,
            type: (lastItem.content?.length > 200 || lastItem.content?.includes('\n')) ? 'long' : 'short',
            sources: lastItem.sources || [],
            youtubeData: lastItem.youtubeData,
            youtubeSummary: lastItem.youtubeLink,
            pluginResult: lastItem.pluginExecution
          });
          
          // Trigger speaking animation if TTS is on and not thinking
          if (isSpeak && !lastItem.isThinking) {
            setOrbStatus('speaking');
            setTimeout(() => setOrbStatus('idle'), 5000); // Mock duration, ideally driven by actual TTS
          }
        }
      } else {
        // User message, we can clear current response or show "Processing..."
        if (isLoading) {
          setCurrentResponse({
            text: 'Memproses...',
            type: 'short'
          });
        }
      }
    } else {
      // Empty chat
      setCurrentResponse({
        text: 'Halo, saya Mark. Ada yang bisa saya bantu hari ini?',
        type: 'short'
      });
    }
  }, [chatData, isLoading, isSpeak, setOrbStatus]);

  const handleSubmit = () => {
    if (message.trim()) {
      handlePlanningCommand(message);
    }
  };

  return (
    <div className="h-screen bg-[var(--base-300)] text-white overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Floating UI Elements */}
      <FloatingMenu onOpenHistory={() => setIsHistoryOpen(true)} />
      <StatusIndicator notifications={notifications} />
      <ProcessPanel processes={activeProcesses} onDismiss={dismissProcess} />
      <NowPlayingWidget />

      {/* Main Content Area */}
      <div className="relative z-10 flex flex-col items-center w-full h-full px-4 pt-[10vh] pb-40 overflow-y-auto custom-scrollbar">
        
        {/* The Orb */}
        <OrbVisualizer status={orbStatus} intensity={0.5} />

        {/* Dynamic Response Area */}
        <div className="w-full max-w-4xl mt-8 flex flex-col items-center justify-center transition-all duration-500 ease-in-out">
          {currentResponse && (
            <ResponseArea currentResponse={currentResponse} />
          )}
        </div>

      </div>

      {/* Bottom Input Area */}
      <InputBar 
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        isSpeak={isSpeak}
        onToggleSpeak={() => setIsSpeak(!isSpeak)}
        onStop={handleStop}
        source={inputSource}
      />

      {/* Slide-out Drawers */}
      <HistoryDrawer 
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />
    </div>
  );
};

export default MarkHome;
