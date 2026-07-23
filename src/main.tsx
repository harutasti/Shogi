import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ModeSeparationPrototype, prototypeVariantFromSearch } from './prototypes/ModeSeparationPrototype'
import './app.css'

const prototypeVariant = prototypeVariantFromSearch(window.location.search)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {prototypeVariant ? <ModeSeparationPrototype initialVariant={prototypeVariant} /> : <App />}
  </StrictMode>,
)
