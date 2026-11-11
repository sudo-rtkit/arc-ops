import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-600.css';
import '../ui/tokens.css';
import './buddy.css';
import BuddyApp from './BuddyApp';

createRoot(document.getElementById('root')!).render(<React.StrictMode><BuddyApp /></React.StrictMode>);
