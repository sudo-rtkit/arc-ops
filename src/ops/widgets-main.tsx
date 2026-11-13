import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/chakra-petch/latin-ext-600.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-ext-400.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '../ui/tokens.css';
/* štítky typů míst (barvy a glyfy) u položek seznamu k nalezení */
import '../ui/maps.css';
import './widgets.css';
import WidgetsApp from './WidgetsApp';

createRoot(document.getElementById('root')!).render(<React.StrictMode><WidgetsApp /></React.StrictMode>);
