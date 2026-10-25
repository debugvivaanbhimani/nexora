import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App/><Toaster position="bottom-right" toastOptions={{className:'vault-toast'}}/></React.StrictMode>
);
