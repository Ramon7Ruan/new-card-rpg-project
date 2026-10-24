import { createRoot } from 'react-dom/client';
import App from './ui/App';
import './ui/styles.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root not found');

createRoot(el).render(<App />);
