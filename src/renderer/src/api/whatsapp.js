// src/renderer/src/api/whatsapp.js

export const checkUnreadAndClick = async (webviewRef) => {
  if (!webviewRef.current) return false

  const jsCode = `
    (function() {
      try {
        const unreadBadge = document.querySelector('span[data-testid="icon-unread-count"]') ||
                            document.querySelector('span[aria-label*="unread message"]') ||
                            document.querySelector('span[aria-label*="pesan belum dibaca"]') ||
                            document.querySelector('div[role="gridcell"] span[dir="ltr"]');

        if (unreadBadge && !isNaN(parseInt(unreadBadge.innerText)) && unreadBadge.closest('div[role="row"]')) {
          const chatRow = unreadBadge.closest('div[role="row"]') || unreadBadge.closest('div[role="listitem"]');
          if (chatRow) {
            const clickable = unreadBadge;
            const eventTypes = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
            eventTypes.forEach(type => {
              clickable.dispatchEvent(new MouseEvent(type, {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1,
                clientX: clickable.getBoundingClientRect().left + 2,
                clientY: clickable.getBoundingClientRect().top + 2
              }));
            });
            return true; // Berhasil klik
          }
        }
      } catch (e) {
        return false;
      }
      return false; // Tidak ada pesan belum dibaca
    })()
  `;

  return await webviewRef.current.executeJavaScript(jsCode);
}

export const extractLatestMessage = async (webviewRef) => {
  if (!webviewRef.current) return null

  const jsCode = `
    (function() {
      try {
        const messageBlocks = document.querySelectorAll('[data-pre-plain-text]') || document.querySelectorAll('.message-in, .message-out');
        if (messageBlocks.length === 0) return null;

        const lastMessageBlock = messageBlocks[messageBlocks.length - 1];
        const preText = lastMessageBlock.getAttribute('data-pre-plain-text') || '';
        const textElement = lastMessageBlock.querySelector('span[data-testid="selectable-text"]') || lastMessageBlock.querySelector('.copyable-text') || lastMessageBlock.querySelector('span[dir="ltr"]');
        const text = textElement ? textElement.innerText.trim() : '[Media/Sticker]';
        
        if (!text) return null;
        
        const currentMessageId = preText + text;

        const isOutgoing = lastMessageBlock.closest('[data-testid^="conv-msg-"]')?.querySelector('[data-testid="tail-out"]') !== null ||
                           lastMessageBlock.closest('[data-testid^="conv-msg-"]')?.querySelector('svg title')?.textContent.toLowerCase().includes('read') ||
                           lastMessageBlock.className.includes('message-out');

        let sender = 'Teman';
        if (preText) {
          const match = preText.match(/]\\s*(.*?):/);
          if (match && match[1]) {
            sender = match[1].trim();
          }
        }

        let quotedSender = null;
        let quotedText = null;
        const quotedBlock = lastMessageBlock.querySelector('[data-testid="quoted-message"]');
        if (quotedBlock) {
          const qSenderEl = quotedBlock.querySelector('span[dir="auto"]');
          if (qSenderEl) quotedSender = qSenderEl.innerText.trim();
          
          const qTextEl = quotedBlock.querySelector('.quoted-mention');
          if (qTextEl) quotedText = qTextEl.innerText.trim();
        }

        const chatTitleElement = document.querySelector('[data-testid="conversation-info-header-chat-title"]') || document.querySelector('header span[dir="auto"]');
        const chatTitle = chatTitleElement ? chatTitleElement.innerText.trim() : sender;

        const isGroup = (sender !== chatTitle && chatTitle !== 'Teman');

        return {
          id: currentMessageId,
          text,
          sender,
          chatTitle,
          isGroup,
          isOutgoing,
          quotedSender,
          quotedText
        };
      } catch (e) {
        return null;
      }
    })()
  `;

  return await webviewRef.current.executeJavaScript(jsCode);
}

export const sendReplyMessage = async (webviewRef, text) => {
  if (!webviewRef.current) return false

  // Escape text for javascript execution
  const escapedText = JSON.stringify(text);

  const jsCode = `
    (function() {
      try {
        const textToInject = ${escapedText};
        const inputBox = document.querySelector('div[contenteditable="true"][data-tab="10"]') || 
                         document.querySelector('div[contenteditable="true"][title="Ketik pesan"]') || 
                         document.querySelector('div[contenteditable="true"][title="Type a message"]') || 
                         document.querySelector('footer div[contenteditable="true"]');
        
        if (inputBox) {
          inputBox.focus();
          
          // Lexical Editor WA merespons paling baik dengan insertHTML memakai <br> untuk enter
          const escapeHTML = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const htmlText = escapeHTML(textToInject).replace(/\n/g, '<br>');
          
          document.execCommand('insertHTML', false, htmlText);
          inputBox.dispatchEvent(new Event('input', { bubbles: true }));
          
          setTimeout(() => {
            const sendButton = document.querySelector('span[data-icon="send"]')?.closest('button') || 
                               document.querySelector('button[aria-label="Kirim"]') || 
                               document.querySelector('button[aria-label="Send"]');
            
            if (sendButton) {
              sendButton.click();
            } else {
              const enterEvent = new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                key: 'Enter',
                code: 'Enter',
                keyCode: 13
              });
              inputBox.dispatchEvent(enterEvent);
            }
          }, 800);
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    })()
  `;

  return await webviewRef.current.executeJavaScript(jsCode);
}
