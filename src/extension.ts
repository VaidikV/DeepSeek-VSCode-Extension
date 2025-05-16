import * as vscode from 'vscode';
import * as path from 'path';
import ollama from 'ollama';

// Store the current model name
let currentModel: string = 'deepseek-r1:1.5b'; // Default model
// Track active panels
let activePanels: vscode.WebviewPanel[] = [];
// Store conversation history for each panel
const panelConversations = new Map<vscode.WebviewPanel, Array<{ role: string, content: string }>>();

export function activate(context: vscode.ExtensionContext) {
  // Load saved model from settings if available
  currentModel = context.globalState.get('omnichatModel') || 'deepseek-r1:1.5b';

  // Register the command to set the model
  const setModelCommand = vscode.commands.registerCommand('OmniChat.setModel', async () => {
    const modelName = await vscode.window.showInputBox({
      placeHolder: 'Enter model name (e.g., gemma3, deepseek-r1:1.5b)',
      prompt: 'Specify which Ollama model to use',
      value: currentModel
    });

    if (modelName) {
      currentModel = modelName;
      // Save the model choice for future sessions
      context.globalState.update('omnichatModel', currentModel);
      vscode.window.showInformationMessage(`OmniChat AI: Model set to ${currentModel}`);
      
      // Update all active panels with the new model
      activePanels.forEach(panel => {
        if (panel.visible) {
          panel.webview.postMessage({ 
            command: 'setModel', 
            model: currentModel 
          });
        }
      });
    }
  });

  // Register the start command
  const startCommand = vscode.commands.registerCommand('OmniChat.start', () => {
    const panel = vscode.window.createWebviewPanel(
      'omniChat',
      'OmniChat AI',
      vscode.ViewColumn.One,
      { 
        enableScripts: true,
        retainContextWhenHidden: true, // Keep webview state when switching tabs
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
      }
    );
    
    // Add panel to active panels
    activePanels.push(panel);
    
    // Initialize conversation history for this panel
    panelConversations.set(panel, []);
    
    // Remove panel when disposed
    panel.onDidDispose(() => {
      panelConversations.delete(panel);
      activePanels = activePanels.filter(p => p !== panel);
    }, null, context.subscriptions);
    
    // Get path to CSS file
    const stylePathOnDisk = vscode.Uri.file(path.join(context.extensionPath, 'media', 'chat-style.css'));
    const styleSrc = panel.webview.asWebviewUri(stylePathOnDisk);
    
    panel.webview.html = getWebviewContent(styleSrc);

    // Send current model info to webview after a short delay to ensure webview is ready
    setTimeout(() => {
      panel.webview.postMessage({ 
        command: 'setModel', 
        model: currentModel 
      });
    }, 500);

    panel.webview.onDidReceiveMessage(async (message: any) => {
      console.log("Received message from webview:", message);

      if (message.command === 'chat') {
        const userPrompt = message.text;
        
        // Get conversation history for this panel
        const conversation = panelConversations.get(panel)!;
        
        // Add user message to conversation
        conversation.push({ role: 'user', content: userPrompt });
        
        // Create a unique ID for this response
        const responseId = Date.now().toString();
        
        // First, disable input by notifying the webview
        panel.webview.postMessage({ 
          command: 'setGenerating', 
          isGenerating: true 
        });
        
        // Create placeholder for response
        panel.webview.postMessage({ 
          command: 'createResponsePlaceholder',
          responseId: responseId
        });

        try {
          const streamResponse = await ollama.chat({
            model: currentModel,
            messages: conversation, // Send the entire conversation history
            stream: true,
          });

          let responseText = '';
          
          for await (const part of streamResponse) {
            // Only append the new content
            const newContent = part.message.content;
            responseText += newContent;
            
            // Update the existing message instead of creating a new one
            panel.webview.postMessage({ 
              command: 'updateResponse', 
              text: responseText,
              responseId: responseId
            });
          }
          
          // Add assistant response to conversation history
          conversation.push({ role: 'assistant', content: responseText });
          
        } catch (err) {
          console.error("Error during chat processing:", err);
          panel.webview.postMessage({ 
            command: 'updateResponse', 
            text: `Error: ${String(err)}. Make sure the model "${currentModel}" is available in Ollama.`,
            responseId: responseId
          });
        } finally {
          // Re-enable input when done
          panel.webview.postMessage({ 
            command: 'setGenerating', 
            isGenerating: false 
          });
        }
      } else if (message.command === 'getModel') {
        panel.webview.postMessage({ 
          command: 'setModel', 
          model: currentModel 
        });
      } else if (message.command === 'clearHistory') {
        // Clear the conversation history when requested
        panelConversations.set(panel, []);
      }
    });
  });

  context.subscriptions.push(startCommand, setModelCommand);
}

function getWebviewContent(styleSrc: vscode.Uri): string {
  return /*html*/ `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="${styleSrc}">
      <title>OmniChat AI</title>
    </head>
    <body>
      <div class="chat-container">
        <div class="chat-header">
          <div class="chat-title">
            <div class="chat-icon">🧠</div>
            <h1>OmniChat AI</h1>
          </div>
          <div class="chat-controls">
            <div class="model-info">Model: <span id="currentModel">Loading...</span></div>
            <button id="clearBtn" class="clear-btn">Clear Chat</button>
          </div>
        </div>
        <div class="chat-messages" id="chatMessages"></div>
        <div class="chat-input-container">
          <textarea id="prompt" placeholder="Ask me anything... (Press Enter to submit, Shift+Enter for new line)"></textarea>
          <button id="askBtn">Ask</button>
        </div>
      </div>

      <!-- Include marked.js -->
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

      <script>
        const vscode = acquireVsCodeApi();
        const askBtn = document.getElementById('askBtn');
        const clearBtn = document.getElementById('clearBtn');
        const promptTextarea = document.getElementById('prompt');
        const chatMessages = document.getElementById('chatMessages');
        
        // Track if the model is generating a response
        let isGenerating = false;
        // Track if user has manually scrolled up during generation
        let userHasScrolled = false;
        
        // Configure marked to properly handle code blocks
        marked.setOptions({
          breaks: true,
          gfm: true,
          headerIds: false,
          mangle: false
        });

        // Function to add a user message
        function addUserMessage(message) {
          const messageDiv = document.createElement('div');
          messageDiv.className = 'message-container user-message-container';
          messageDiv.innerHTML = \`
            <div class="message user-message">
              <div class="message-content">\${message}</div>
            </div>
          \`;
          chatMessages.appendChild(messageDiv);
          
          // Always scroll to bottom when user sends a message
          scrollToBottom();
          
          // Reset the user scroll flag when a new message is sent
          userHasScrolled = false;
        }
        
        // Function to check if user is scrolled to bottom
        function isUserAtBottom() {
          const tolerance = 50; // pixels from bottom to consider "at bottom"
          return chatMessages.scrollHeight - chatMessages.clientHeight - chatMessages.scrollTop <= tolerance;
        }
        
        // Function to scroll to bottom
        function scrollToBottom() {
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        // Function to create a placeholder for bot response
        function createBotResponsePlaceholder(responseId) {
          const messageDiv = document.createElement('div');
          messageDiv.className = 'message-container bot-message-container';
          messageDiv.innerHTML = \`
            <div class="message bot-message" id="response-\${responseId}">
              <div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
            </div>
          \`;
          chatMessages.appendChild(messageDiv);
          
          // Always scroll to bottom when a response starts generating
          scrollToBottom();
        }
        
        // Function to format thinking tags in italics
        function formatThinkingTags(text) {
          // Check if there are thinking tags
          if (text.includes('<think>')) {
            // Replace <think>...</think> with italicized text
            return text.replace(/<think>([\\s\\S]*?)<\\/think>/g, '<div class="thinking-text"><em>$1</em></div>');
          }
          return text;
        }
        
        // Function to update bot response
        function updateBotResponse(responseId, message) {
          const responseElement = document.getElementById(\`response-\${responseId}\`);
          if (responseElement) {
            // Format thinking tags
            const formattedMessage = formatThinkingTags(message);
            
            // Process the message with marked to render markdown
            const formattedHtml = marked.parse(formattedMessage);
            
            responseElement.innerHTML = \`<div class="message-content">\${formattedHtml}</div>\`;
            
            // Only auto-scroll if user hasn't manually scrolled up
            if (!userHasScrolled) {
              scrollToBottom();
            }
          }
        }
        
        // Function to toggle input state
        function setInputState(disabled) {
          promptTextarea.disabled = disabled;
          askBtn.disabled = disabled;
          isGenerating = disabled;
          
          if (!disabled) {
            // Focus the textarea when re-enabled
            promptTextarea.focus();
            // Reset the user scroll flag when generation completes
            userHasScrolled = false;
          }
        }

        // Save state
        function saveState() {
          const state = {
            chatHistory: chatMessages.innerHTML,
            model: document.getElementById('currentModel').textContent
          };
          vscode.setState(state);
        }

        // Restore state
        function restoreState() {
          const state = vscode.getState();
          if (state) {
            if (state.chatHistory) {
              chatMessages.innerHTML = state.chatHistory;
              chatMessages.scrollTop = chatMessages.scrollHeight;
            }
            if (state.model && state.model !== "Loading...") {
              document.getElementById('currentModel').textContent = state.model;
            }
          }
          
          // Add welcome message if chat is empty
          if (chatMessages.children.length === 0) {
            const welcomeDiv = document.createElement('div');
            welcomeDiv.className = 'welcome-message';
            welcomeDiv.innerHTML = \`
              <h2>Welcome to OmniChat AI!</h2>
              <p>Ask me anything and I'll respond using the \${document.getElementById('currentModel').textContent} model.</p>
              <p>All processing happens locally on your machine through Ollama.</p>
            \`;
            chatMessages.appendChild(welcomeDiv);
          }
        }

        // Call restoreState after a short delay to ensure DOM is ready
        setTimeout(restoreState, 100);

        // Track when user manually scrolls
        chatMessages.addEventListener('scroll', () => {
          if (isGenerating && !isUserAtBottom()) {
            userHasScrolled = true;
          }
        });

        // Request current model when loaded
        window.addEventListener('load', () => {
          vscode.postMessage({ command: 'getModel' });
        });

        // Click event for the Ask button
        askBtn.addEventListener('click', () => {
          if (isGenerating) return; // Prevent sending when already generating
          
          const text = promptTextarea.value.trim();
          if (!text) return;
          
          addUserMessage(text);
          vscode.postMessage({ command: 'chat', text });
          promptTextarea.value = '';
          saveState();
        });
        
        // Clear chat history
        clearBtn.addEventListener('click', () => {
          chatMessages.innerHTML = '';
          vscode.postMessage({ command: 'clearHistory' });
          
          // Re-add welcome message
          const welcomeDiv = document.createElement('div');
          welcomeDiv.className = 'welcome-message';
          welcomeDiv.innerHTML = \`
            <h2>Welcome to OmniChat AI!</h2>
            <p>Ask me anything and I'll respond using the \${document.getElementById('currentModel').textContent} model.</p>
            <p>All processing happens locally on your machine through Ollama.</p>
          \`;
          chatMessages.appendChild(welcomeDiv);
          
          saveState();
        });

        // Handle Enter key to submit (but Shift+Enter for new line)
        promptTextarea.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey && !isGenerating) {
            e.preventDefault();
            askBtn.click();
          }
        });

        window.addEventListener('message', event => {
          const { command, text, model, responseId, isGenerating: generating } = event.data;

          if (command === 'setGenerating') {
            setInputState(generating);
          } else if (command === 'createResponsePlaceholder') {
            createBotResponsePlaceholder(responseId);
            saveState();
          } else if (command === 'updateResponse') {
            updateBotResponse(responseId, text);
            saveState();
          } else if (command === 'setModel') {
            document.getElementById('currentModel').textContent = model;
            saveState();
          }
        });
      </script>
    </body>
    </html>`;
}

export function deactivate() {}
