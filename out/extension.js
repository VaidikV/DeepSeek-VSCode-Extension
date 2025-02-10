"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ollama_1 = __importDefault(require("ollama"));
function activate(context) {
    const disposable = vscode.commands.registerCommand('DeepSeek.start', () => {
        vscode.window.showInformationMessage('Hello World from DeepSeek!');
        const panel = vscode.window.createWebviewPanel('deepChat', 'Deep Seek Chat', vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.html = getWebviewContent();
        panel.webview.onDidReceiveMessage(async (message) => {
            console.log("Received message from webview:", message);
            if (message.command === 'chat') {
                const userPrompt = message.text;
                let responseText = '';
                try {
                    const streamResponse = await ollama_1.default.chat({
                        model: 'deepseek-r1:1.5b',
                        messages: [{ role: 'user', content: userPrompt }],
                        stream: true,
                    });
                    for await (const part of streamResponse) {
                        responseText += part.message.content;
                        console.log("Sending chat response to webview:", responseText);
                        panel.webview.postMessage({ command: 'chatResponse', text: responseText });
                    }
                }
                catch (err) {
                    console.error("Error during chat processing:", err);
                    panel.webview.postMessage({ command: 'chatResponse', text: `Error: ${String(err)}` });
                }
            }
        });
    });
    context.subscriptions.push(disposable);
}
function getWebviewContent() {
    return /*html*/ `
	  <!DOCTYPE html>
	  <html lang="en">
	  <head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<style>
		  :root {
			--vscode-font: 'Segoe UI', system-ui, sans-serif;
			--bg: var(--vscode-editor-background);
			--text: var(--vscode-editor-foreground);
			--border: var(--vscode-editorWidget-border);
		  }
  
		  body {
			font-family: var(--vscode-font);
			margin: 0;
			padding: 1rem;
			background: var(--bg);
			color: var(--text);
			min-height: 100vh;
		  }
  
		  .container {
			max-width: 800px;
			margin: 0 auto;
		  }
  
		  .chat-input {
			display: flex;
			gap: 0.5rem;
			margin-bottom: 1rem;
		  }
  
		  textarea {
			flex: 1;
			padding: 0.8rem;
			border: 1px solid var(--border);
			border-radius: 4px;
			background: var(--vscode-input-background);
			color: var(--text);
		  }
  
		  button {
			padding: 0.8rem 1.5rem;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border-radius: 4px;
		  }
  
		  .response-box {
			border: 1px solid var(--border);
			border-radius: 4px;
			padding: 1rem;
			background-color: var(--vscode-editorWidget-background);
		  }
  
		  pre, code {
			background-color: #2d2d2d; /* Dark theme for code blocks */
			color: #f8f8f2; /* Light text */
			padding: 0.1rem;
			border-radius: 4px;
		  }
		</style>
	  </head>
	  <body>
		<div class="container">
		  <h1>🧠 DeepSeek Assistant</h1>
		  <div class="chat-input">
			<textarea id="prompt" placeholder="Ask me anything..."></textarea>
			<button id="askBtn">Ask</button>
		  </div>
		  <div class="response-box" id="response"></div>
		</div>
  
		<!-- Include marked.js -->
		<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  
		<script>
		  const vscode = acquireVsCodeApi();
		  const btn = document.getElementById('askBtn');
		  
		  btn.addEventListener('click', () => {
			const text = document.getElementById('prompt').value;
			if (!text) return;
  
			vscode.postMessage({ command: 'chat', text });
		  });
  
		  window.addEventListener('message', event => {
			const { command, text } = event.data;
			if (command === 'chatResponse') {
			  // Use marked.js to render markdown
			  const formatted = marked.parse(text);
			  document.getElementById('response').innerHTML = formatted;
			}
		  });
		</script>
	  </body>
	  </html>`;
}
function deactivate() { }
//# sourceMappingURL=extension.js.map