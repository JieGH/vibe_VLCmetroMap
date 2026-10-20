import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { I18nProvider } from './i18n'
import { Capacitor } from '@capacitor/core'
import { applyUiZoom } from './utils/uiScale'

// Before the first render, so the layout is measured at its final size.
applyUiZoom(Capacitor.getPlatform())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
