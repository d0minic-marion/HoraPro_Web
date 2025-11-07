import React from 'react';
import ReactDOM from 'react-dom/client';
import 'normalize.css/normalize.css'; // Import normalize.css first
import './index.css';
import App from './App';
import QrApp from './QrApp';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));

const isQrMode = process.env.REACT_APP_MODE === 'qr';

root.render(isQrMode ? <QrApp /> : <App />);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
