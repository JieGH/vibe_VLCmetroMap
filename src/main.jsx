import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { I18nProvider } from './i18n'
import { Capacitor } from '@capacitor/core'
import { applyUiZoom } from './utils/uiScale'
import { isAndroid } from './utils/platform'
import arrivalStore from './services/arrivalStore'

// Before the first render, so the layout is measured at its final size.
applyUiZoom(Capacitor.getPlatform())

// Start network arrival sync early in parallel with React mounting and chunk loading
if (typeof window !== 'undefined') {
  arrivalStore.bootNetwork()
}

// The Material 3 design belongs to the Android app alone. The stylesheet is a
// dynamic import so the web and iOS bundles never load it, and the class goes
// on first so the first paint is already Material.
let designReady = Promise.resolve()
if (isAndroid()) {
  document.documentElement.classList.add('android')
  designReady = import('./android.css').catch(() => {})
}

designReady.then(() => createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
))
