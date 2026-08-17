import React, { createContext, useState, useContext, useCallback } from 'react';

const ApprovalContext = createContext();

export const ApprovalProvider = ({ children }) => {
  const [approvalData, setApprovalData] = useState(null);

  React.useEffect(() => {
    if (window.api?.onTgCommandAccept) {
      window.api.onTgCommandAccept((data) => {
        setApprovalData(prev => {
          if (prev) {
            prev.resolve(true);
            if (data?.chatId && window.api.tgSendMessage) {
              window.api.tgSendMessage(data.chatId, '[INFO]: Permintaan persetujuan telah diizinkan.');
            }
            return null;
          } else {
            if (data?.chatId && window.api.tgSendMessage) {
              window.api.tgSendMessage(data.chatId, '[INFO]: Tidak ada permintaan persetujuan yang sedang menunggu.');
            }
          }
          return prev;
        });
      });
    }
  }, []);

  const requestApproval = useCallback((message, tool, query) => {
    if (window.api?.tgBroadcastToAdmins) {
      window.api.tgBroadcastToAdmins(`[INFO]: Persetujuan Dibutuhkan\nTool: \`${tool}\`\n\n${message}\n\nKetik /accept untuk mengizinkan.`);
    }
    return new Promise((resolve) => {
      setApprovalData({ message, tool, query, resolve });
    });
  }, []);

  const handleApprove = () => {
    if (approvalData) {
      approvalData.resolve(true);
      setApprovalData(null);
    }
  };

  const handleReject = () => {
    if (approvalData) {
      approvalData.resolve(false);
      setApprovalData(null);
    }
  };

  return (
    <ApprovalContext.Provider value={{ requestApproval }}>
      {children}
      {approvalData && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-base-200 border border-base-300 p-6 rounded-2xl shadow-2xl max-w-lg w-full">
            <h3 className="text-xl font-bold text-error mb-4 flex items-center gap-2">
              <span className="text-2xl">⚠️</span> Mark meminta izin
            </h3>
            <p className="mb-2 text-sm text-base-content/80">Mark membutuhkan persetujuan Anda untuk melanjutkan eksekusi tool ini.</p>
            <div className="whitespace-pre-wrap font-mono text-sm bg-base-300 p-4 rounded-xl overflow-x-auto max-h-60 overflow-y-auto shadow-inner border border-base-100 mb-6">
              {approvalData.message}
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button className="btn btn-ghost" onClick={handleReject}>Tolak</button>
              <button className="btn btn-error" onClick={handleApprove}>Izinkan ✓</button>
            </div>
          </div>
        </div>
      )}
    </ApprovalContext.Provider>
  );
};

export const useApproval = () => useContext(ApprovalContext);
