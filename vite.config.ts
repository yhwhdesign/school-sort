import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Distinct port from SpeechCraft so both can run at once on one machine.
    host: true,
    port: 5178,
  },
})
