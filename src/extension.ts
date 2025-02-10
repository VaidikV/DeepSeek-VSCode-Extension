import * as vscode from 'vscode';
import ollama from 'ollama';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('DeepSeek.start', () => {
    vscode.window.showInformationMessage('Hello World from DeepSeek!');

    const panel = vscode.window.createWebviewPanel(
      'deepChat',
      'Deep Seek Chat',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    panel.webview.html = getWebviewContent();

    panel.webview.onDidReceiveMessage(async (message: any) => {
      console.log("Received message from webview:", message);

      if (message.command === 'chat') {
        const userPrompt = message.text;
        let responseText = '';

        try {
          const streamResponse = await ollama.chat({
            model: 'deepseek-r1:1.5b',
            messages: [{ role: 'user', content: userPrompt }],
            stream: true,
          });

          for await (const part of streamResponse) {
            responseText += part.message.content;
            console.log("Sending chat response to webview:", responseText);
            panel.webview.postMessage({ command: 'chatResponse', text: responseText });
          }
        } catch (err) {
          console.error("Error during chat processing:", err);
          panel.webview.postMessage({ command: 'chatResponse', text: `Error: ${String(err)}` });
        }
      }
    });
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent(): string {
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

export function deactivate() {}
