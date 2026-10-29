import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { I18nProvider } from './i18n'
import { Capacitor } from '@capacitor/core'
import { applyUiZoom } from './utils/uiScale'
// Before the first render, so the layout is measured at its final size.
applyUiZoom(Capacitor.getPlatform())

// The Capacitor app draws the same interface as the website and the iOS app. The Material 3 skin
// (src/android.css, ADR-0009) is no longer loaded or applied; the Android-only behaviour (back button,
// location rationale, settings shortcut) stays, gated by isAndroid() where it is used.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
)
