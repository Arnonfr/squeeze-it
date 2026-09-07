# Squeeze It

Paste a public product URL, scan its visible content and features, and get the smallest testable MVP brief. Analysis runs server-side through OpenRouter so the API key never reaches the browser.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set `OPENROUTER_API_KEY`
3. Run the app:
   `npm run dev`

The default model is `openai/gpt-5`. Override it with `OPENROUTER_MODEL` when you need a different model version.
