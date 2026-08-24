import './style.css'
import { mountApp } from './app.js'

const root = document.getElementById('app')
if (root == null) throw new Error('index.html is missing #app')

void mountApp(root)
