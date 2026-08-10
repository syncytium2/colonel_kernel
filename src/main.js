import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

// index.html ships a static, crawler-readable summary inside #app (Svelte 5's
// mount() appends rather than replaces, so it must be cleared here).
const target = document.getElementById('app')
target.textContent = ''

const app = mount(App, { target })

export default app
