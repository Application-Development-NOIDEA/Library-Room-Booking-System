import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  input: {
    student: resolve(import.meta.dirname, 'index.html'),
    staff: resolve(import.meta.dirname, 'staff.html'),
  },
})
